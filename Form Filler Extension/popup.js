let csvData = [];
let selectedRow = null;

// Load saved CSV data on popup open
document.addEventListener('DOMContentLoaded', async () => {
    const saved = await chrome.storage.local.get(['csvData']);
    if (saved.csvData) {
        csvData = saved.csvData;
        displayEmails();
    } else {
        // Try to load the default CSV file
        await loadDefaultCsv();
    }
});

// Load default CSV file
async function loadDefaultCsv() {
    try {
        // Try to fetch the CSV file from the extension directory
        const response = await fetch(chrome.runtime.getURL('Email_details_sample.csv'));
        if (response.ok) {
            const text = await response.text();
            
            Papa.parse(text, {
                header: true,
                skipEmptyLines: true,
                trimHeaders: true,
                complete: async (results) => {
                    console.log('Default CSV loaded:', results);
                    
                    // Filter out completely empty rows
                    csvData = results.data.filter(row => {
                        return Object.values(row).some(value => value && value.trim() !== '');
                    });
                    
                    if (csvData.length > 0) {
                        await chrome.storage.local.set({ csvData: csvData });
                        displayEmails();
                        showStatus(`Loaded ${csvData.length} entries from default CSV`, 'success');
                    }
                },
                error: (error) => {
                    console.error('Error parsing default CSV:', error);
                }
            });
        }
    } catch (error) {
        console.log('No default CSV file found or error loading:', error);
    }
}

// Load CSV file
document.getElementById('loadCsv').addEventListener('click', () => {
    const fileInput = document.getElementById('csvFile');
    const file = fileInput.files[0];
    
    if (!file) {
        showStatus('Please select a CSV file', 'error');
        return;
    }
    
    // Read file with FileReader to handle encoding issues
    const reader = new FileReader();
    
    reader.onload = function(e) {
        const text = e.target.result;
        console.log('File content loaded, length:', text.length);
        
        Papa.parse(text, {
            header: true,
            skipEmptyLines: true,
            trimHeaders: true,
            complete: async (results) => {
                console.log('Parse complete:', results);
                console.log('Parsed data:', results.data);
                console.log('Errors:', results.errors);
                
                // Filter out completely empty rows
                csvData = results.data.filter(row => {
                    // Check if row has any non-empty values
                    return Object.values(row).some(value => value && value.trim() !== '');
                });
                
                console.log('Filtered data:', csvData);
                
                if (csvData.length === 0) {
                    showStatus('No valid data found in CSV. Check console for details.', 'error');
                    console.error('CSV appears to be empty or improperly formatted');
                    return;
                }
                
                await chrome.storage.local.set({ csvData: csvData });
                displayEmails();
                showStatus(`Loaded ${csvData.length} entries from CSV`, 'success');
            },
            error: (error) => {
                console.error('Papa Parse Error:', error);
                showStatus('Error parsing CSV: ' + error.message, 'error');
            }
        });
    };
    
    reader.onerror = function(error) {
        console.error('FileReader Error:', error);
        showStatus('Error reading file: ' + error.message, 'error');
    };
    
    // Read as text with UTF-8 encoding
    reader.readAsText(file, 'UTF-8');
});

// Display emails in the list
function displayEmails() {
    const emailList = document.getElementById('emailList');
    
    if (csvData.length === 0) {
        emailList.innerHTML = '<p class="placeholder">No data found in CSV</p>';
        document.getElementById('fillForm').disabled = true;
        return;
    }
    
    emailList.innerHTML = csvData.map((row, index) => {
        // More flexible display - show whatever identifying info is available
        const primaryInfo = row.email || row.Email || row.EMAIL || 
                          row.username || row.Username || 
                          row.name || row.Name || 
                          `Entry ${index + 1}`;
        
        const secondaryInfo = [];
        if (row.username || row.Username) secondaryInfo.push(row.username || row.Username);
        if (row.name || row.Name) secondaryInfo.push(row.name || row.Name);
        if (row.firstName || row.FirstName) secondaryInfo.push(row.firstName || row.FirstName);
        
        const secondaryText = secondaryInfo.filter(info => info !== primaryInfo).join(' - ') || 'No additional info';
        
        return `
            <div class="email-item" data-index="${index}">
                <div class="email">${primaryInfo}</div>
                <div class="username">${secondaryText}</div>
            </div>
        `;
    }).join('');
    
    // Add click handlers
    emailList.querySelectorAll('.email-item').forEach(item => {
        item.addEventListener('click', () => {
            // Remove previous selection
            emailList.querySelectorAll('.email-item').forEach(el => 
                el.classList.remove('selected')
            );
            
            // Select new item
            item.classList.add('selected');
            selectedRow = csvData[parseInt(item.dataset.index)];
            document.getElementById('fillForm').disabled = false;
            
            console.log('Selected row:', selectedRow);
        });
    });
}

// Fill form with selected data
document.getElementById('fillForm').addEventListener('click', async () => {
    if (!selectedRow) {
        showStatus('Please select an email first', 'error');
        return;
    }
    
    try {
        // Get the active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        // First, ensure content script is injected
        await ensureContentScriptInjected(tab.id);
        
        // Get field mappings for current domain
        const domain = new URL(tab.url).hostname;
        const { fieldMappings = {} } = await chrome.storage.local.get('fieldMappings');
        const siteMapping = fieldMappings[domain] || {};
        
        // Normalize the data keys (handle different case variations)
        const normalizedData = {};
        for (const [key, value] of Object.entries(selectedRow)) {
            normalizedData[key.toLowerCase()] = value;
            normalizedData[key] = value; // Keep original too
        }
        
        console.log('Sending data to content script:', normalizedData);
        
        // Send message to content script with timeout
        const response = await sendMessageWithTimeout(tab.id, {
            action: 'fillForm',
            data: normalizedData,
            mapping: siteMapping
        }, 5000); // 5 second timeout
        
        if (response && response.success) {
            showStatus('Form filled successfully', 'success');
        } else {
            showStatus('Form filling completed but may have issues', 'error');
        }
    } catch (error) {
        console.error('Error filling form:', error);
        if (error.message.includes('Could not establish connection')) {
            showStatus('Please refresh the page and try again', 'error');
        } else {
            showStatus('Error filling form: ' + error.message, 'error');
        }
    }
});

// Ensure content script is injected
async function ensureContentScriptInjected(tabId) {
    try {
        // Try to ping the content script
        await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    } catch (error) {
        // If ping fails, inject the content script
        console.log('Content script not found, injecting...');
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content.js']
        });
        
        // Wait a bit for the script to load
        await new Promise(resolve => setTimeout(resolve, 500));
    }
}

// Send message with timeout
function sendMessageWithTimeout(tabId, message, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            reject(new Error('Message timeout'));
        }, timeout);
        
        chrome.tabs.sendMessage(tabId, message, (response) => {
            clearTimeout(timeoutId);
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve(response);
            }
        });
    });
}

// Map fields button
document.getElementById('mapFields').addEventListener('click', async () => {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        // First, ensure content script is injected
        await ensureContentScriptInjected(tab.id);
        
        // Send message to content script to collect form fields
        const response = await sendMessageWithTimeout(tab.id, {
            action: 'collectFields'
        }, 5000);
        
        if (response && response.fields) {
            console.log('Form fields found:', response.fields);
            showStatus(`Found ${response.fields.length} form fields`, 'success');
            
            // Log field details for debugging
            response.fields.forEach(field => {
                console.log(`Field: ${field.name || field.id || 'unnamed'} - Type: ${field.type} - Detected as: ${field.detectedType}`);
            });
        }
    } catch (error) {
        console.error('Error collecting fields:', error);
        showStatus('Error collecting fields: ' + error.message, 'error');
    }
});

// Show status message
function showStatus(message, type) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = `status ${type}`;
    
    // Don't auto-hide error messages
    if (type !== 'error') {
        setTimeout(() => {
            status.textContent = '';
            status.className = 'status';
        }, 3000);
    }
}