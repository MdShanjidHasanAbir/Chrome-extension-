/**
 * Facebook Post Status Checker Extension
 * Version 1.3 - With working delete functionality
 */

// Global variables
let fileHandle = null;
let workbook = null;
let originalData = null;
let updatedData = null;
let isProcessing = false;
let hasChanges = false;
let extensionWindowId = null;

// Auto-delete pending posts during processing
let autoDeletePending = true; // Set to true to enable auto-delete

// Columns to exclude from Excel export
const COLUMNS_TO_EXCLUDE = ['Account', 'Members', 'Raw Members', 'Posts Per Day'];

// DOM elements
const selectFileBtn = document.getElementById('selectFileBtn');
const processBtn = document.getElementById('processBtn');
const saveBtn = document.getElementById('saveBtn');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const progressSection = document.getElementById('progressSection');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const currentUrlDiv = document.getElementById('currentUrl');
const currentStatusDiv = document.getElementById('currentStatus');
const statusMessage = document.getElementById('statusMessage');
const statistics = document.getElementById('statistics');
const statsToggleContainer = document.getElementById('statsToggleContainer');
const statsToggleBtn = document.getElementById('statsToggleBtn');

// Event listeners
selectFileBtn.addEventListener('click', handleFileSelection);
processBtn.addEventListener('click', startProcessing);
saveBtn.addEventListener('click', saveFile);
document.getElementById('downloadBtn').addEventListener('click', downloadCurrentData);
statsToggleBtn.addEventListener('click', toggleStatistics);

function toggleStatistics() {
  const isCollapsed = statistics.classList.contains('collapsed');
  
  if (isCollapsed) {
    statistics.classList.remove('collapsed');
    statsToggleBtn.classList.add('active');
    statsToggleBtn.querySelector('.toggle-text').textContent = 'Hide Results';
  } else {
    statistics.classList.add('collapsed');
    statsToggleBtn.classList.remove('active');
    statsToggleBtn.querySelector('.toggle-text').textContent = 'Show Results';
  }
}

chrome.runtime.sendMessage({ action: 'getWindowId' }, (response) => {
  if (response && response.windowId) {
    extensionWindowId = response.windowId;
  }
});

window.addEventListener('beforeunload', (e) => {
  if (isProcessing) {
    e.preventDefault();
    e.returnValue = 'Processing is in progress. Are you sure you want to close?';
    return 'Processing is in progress. Are you sure you want to close?';
  }
});

async function downloadCurrentData() {
  try {
    if (!workbook && !updatedData && !originalData) {
      alert('No data available to download. Please load an Excel file first.');
      return;
    }

    const dataToDownload = updatedData || originalData;
    if (!dataToDownload) {
      alert('No data available to download.');
      return;
    }

    const cleanedData = removeColumns(dataToDownload, COLUMNS_TO_EXCLUDE);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(cleanedData);
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");

    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    const url = window.URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = 'facebook_post_status_' + new Date().toISOString().slice(0, 10) + '.xlsx';
    
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    window.URL.revokeObjectURL(url);

    showStatus('✅ File downloaded successfully! Window will close shortly...', 'success');
    chrome.runtime.sendMessage({ action: 'manualDownloadCompleted' });

  } catch (error) {
    console.error('Error downloading file:', error);
    alert('Error downloading file. Please try again.');
  }
}

async function handleFileSelection() {
  try {
    const pickerOpts = {
      types: [{
        description: 'Excel Files',
        accept: {
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
          'application/vnd.ms-excel': ['.xls']
        }
      }],
      multiple: false
    };

    const [handle] = await window.showOpenFilePicker(pickerOpts);
    fileHandle = handle;

    const file = await fileHandle.getFile();
    const arrayBuffer = await file.arrayBuffer();

    workbook = XLSX.read(arrayBuffer, { type: 'array' });

    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    originalData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    const headers = originalData[0] || [];
    const urlColIndex = headers.findIndex(h => h && h.toString().toLowerCase().includes('url'));

    if (urlColIndex === -1) {
      throw new Error('URL column not found in Excel file');
    }

    const stateColIndex = headers.findIndex(h => h && h.toString().toLowerCase().includes('post state'));
    const countColIndex = headers.findIndex(h => h && h.toString().toLowerCase().includes('post count'));

    let validUrlCount = 0;
    for (let i = 1; i < originalData.length; i++) {
      const url = originalData[i] ? originalData[i][urlColIndex] : null;
      if (url && url.toString().includes('facebook.com')) {
        validUrlCount++;
      }
    }

    if (validUrlCount === 0) {
      throw new Error('No valid Facebook URLs found in the Excel file');
    }

    fileName.textContent = file.name;
    processBtn.classList.remove('hidden');
    saveBtn.classList.add('hidden');
    statistics.classList.add('hidden', 'collapsed');
    statsToggleContainer.classList.add('hidden');

    let message = `✅ File loaded! Found ${validUrlCount} Facebook URLs.`;
    if (stateColIndex === -1) message += ' Will add "Post State" column.';
    if (countColIndex === -1) message += ' Will add "Post Count" column.';

    showStatus(message, 'success');

  } catch (error) {
    if (error.name === 'AbortError') {
      showStatus('File selection cancelled', 'info');
    } else {
      showStatus(`Error loading file: ${error.message}`, 'error');
      console.error('File selection error:', error);
    }
    fileHandle = null;
    workbook = null;
    originalData = null;
  }
}

async function startProcessing() {
  if (!fileHandle || !originalData) {
    showStatus('Please select a file first', 'warning');
    return;
  }
  if (isProcessing) {
    showStatus('Processing already in progress', 'warning');
    return;
  }

  isProcessing = true;
  chrome.runtime.sendMessage({ action: 'processingStarted' });

  processBtn.disabled = true;
  selectFileBtn.disabled = true;
  saveBtn.classList.add('hidden');

  try {
    updatedData = JSON.parse(JSON.stringify(originalData));

    const headers = updatedData[0];
    let urlColIndex = headers.findIndex(h => h && h.toString().toLowerCase().includes('url'));
    let stateColIndex = headers.findIndex(h => h && h.toString().toLowerCase().includes('post state'));
    let countColIndex = headers.findIndex(h => h && h.toString().toLowerCase().includes('post count'));

    if (stateColIndex === -1) {
      headers.push('Post State');
      updatedData[0] = headers;
      stateColIndex = headers.length - 1;
    }

    if (countColIndex === -1) {
      headers.push('Post Count');
      updatedData[0] = headers;
      countColIndex = headers.length - 1;
    }

    const urlsToProcess = [];
    for (let i = 1; i < updatedData.length; i++) {
      if (!updatedData[i]) updatedData[i] = [];
      const url = updatedData[i][urlColIndex];
      if (url && url.toString().includes('facebook.com')) {
        urlsToProcess.push({ rowIndex: i, url: url.toString() });
      }
    }

    progressSection.classList.remove('hidden');
    statistics.classList.add('hidden', 'collapsed');
    statsToggleContainer.classList.add('hidden');
    currentStatusDiv.textContent = '';

    const stats = {
      total: urlsToProcess.length,
      published: 0,
      pending: 0,
      declined: 0,
      removed: 0,
      errors: 0,
      totalPosts: 0
    };

    for (let i = 0; i < urlsToProcess.length; i++) {
      const { rowIndex, url } = urlsToProcess[i];
      
      const progress = ((i + 1) / urlsToProcess.length) * 100;
      progressBar.style.width = `${progress}%`;
      progressText.textContent = `Processing URL ${i + 1} of ${urlsToProcess.length}...`;
      currentUrlDiv.textContent = `Current: ${url.substring(0, 60)}...`;
      currentStatusDiv.textContent = 'Checking post status...';
      
      try {
        const result = await checkPostStatusAndCount(url);
        
        while (updatedData[rowIndex].length <= Math.max(stateColIndex, countColIndex)) {
          updatedData[rowIndex].push('');
        }
        
        updatedData[rowIndex][stateColIndex] = result.status;
        updatedData[rowIndex][countColIndex] = result.count;
        hasChanges = true;
        
        currentStatusDiv.textContent = `Status: ${result.status} | Posts found: ${result.count}`;
        
        switch(result.status.toLowerCase()) {
          case 'published': stats.published++; break;
          case 'pending': stats.pending++; break;
          case 'declined': stats.declined++; break;
          case 'removed': stats.removed++; break;
          default: stats.errors++;
        }
        
        stats.totalPosts += result.count;
        
      } catch (error) {
        console.error(`Error processing URL ${url}:`, error);
        while (updatedData[rowIndex].length <= Math.max(stateColIndex, countColIndex)) {
          updatedData[rowIndex].push('');
        }
        updatedData[rowIndex][stateColIndex] = 'Error';
        updatedData[rowIndex][countColIndex] = 0;
        stats.errors++;
        hasChanges = true;
        currentStatusDiv.textContent = 'Error occurred';
      }
      
      await delay(1500);
    }

    progressSection.classList.add('hidden');
    displayStatistics(stats);

    if (hasChanges) {
      await autoSaveFile();
    } else {
      showStatus('✅ Processing complete! No changes detected.', 'success');
      chrome.runtime.sendMessage({ action: 'processingCompleted' });
    }
  } catch (error) {
    showStatus(`Processing error: ${error.message}`, 'error');
    console.error('Processing error:', error);
    progressSection.classList.add('hidden');
    chrome.runtime.sendMessage({ action: 'processingCompleted' });
  } finally {
    isProcessing = false;
    processBtn.disabled = false;
    selectFileBtn.disabled = false;
  }
}

async function checkPostStatusAndCount(url) {
  return new Promise(async (resolve, reject) => {
    let tabId = null;

    try {
      const tab = await chrome.tabs.create({ url: url, active: false });
      tabId = tab.id;

      await waitForTabLoad(tabId);
      await delay(3000);

      const groupMatch = url.match(/\/groups\/(\d+)\//) || url.match(/\/groups\/([^\/]+)\//);
      if (!groupMatch) {
        throw new Error('Invalid Facebook group URL format');
      }

      const groupId = groupMatch[1];
      const statusChecks = [
        { status: 'Pending', slug: 'my_pending_content' },
        { status: 'Published', slug: 'my_published_content' },
        { status: 'Declined', slug: 'my_declined_content' }
      ];

      let postStatus = 'Removed';
      let postCount = 0;

      for (const { status, slug } of statusChecks) {
        const statusUrl = `https://www.facebook.com/groups/${groupId}/${slug}`;

        await chrome.tabs.update(tabId, { url: statusUrl });
        await waitForTabLoad(tabId);
        await delay(2500);
        
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: checkAndCountPosts
          });
          
          if (results && results[0] && results[0].result) {
            const pageResult = results[0].result;
            if (pageResult.hasPost && pageResult.postCount > 0) {
              postStatus = status;
              postCount = pageResult.postCount;
              
              // If auto-delete is enabled and post is pending
              if (status === 'Pending' && autoDeletePending) {
                currentStatusDiv.textContent = '🗑️ Deleting pending post...';
                
                try {
                  const deleteResponse = await chrome.tabs.sendMessage(tabId, { 
                    action: 'deletePendingPost' 
                  });
                  
                  if (deleteResponse && deleteResponse.success) {
                    currentStatusDiv.textContent = '✅ Pending post deleted!';
                    await delay(2000);
                    
                    // Re-check
                    await chrome.tabs.update(tabId, { url: statusUrl });
                    await waitForTabLoad(tabId);
                    await delay(2500);
                    
                    const recheckResults = await chrome.scripting.executeScript({
                      target: { tabId: tabId },
                      func: checkAndCountPosts
                    });
                    
                    if (recheckResults && recheckResults[0] && recheckResults[0].result) {
                      const recheckResult = recheckResults[0].result;
                      if (!recheckResult.hasPost || recheckResult.postCount === 0) {
                        postStatus = 'Removed';
                        postCount = 0;
                      }
                    }
                  } else {
                    console.log('Delete failed:', deleteResponse?.message);
                    currentStatusDiv.textContent = '⚠️ Could not delete post: ' + (deleteResponse?.message || 'Unknown error');
                  }
                } catch (deleteError) {
                  console.error('Error deleting pending post:', deleteError);
                  currentStatusDiv.textContent = '⚠️ Delete error: ' + deleteError.message;
                }
                
                await delay(1000);
              }
              
              break;
            }
          }
        } catch (scriptError) {
          console.error('Script injection error:', scriptError);
        }
      }

      if (tabId) {
        await chrome.tabs.remove(tabId);
      }

      resolve({ status: postStatus, count: postCount });

    } catch (error) {
      if (tabId) {
        try {
          await chrome.tabs.remove(tabId);
        } catch (e) {}
      }
      reject(error);
    }
  });
}

function checkAndCountPosts() {
  try {
    const noPostsIndicators = [
      'No posts to show',
      'No content to show',
      'Nothing to show here',
      'No pending posts',
      'No declined posts',
      'Be the first to post',
      'No posts available',
      'There are no posts'
    ];

    const pageText = document.body.innerText || '';
    const hasNoPostsMessage = noPostsIndicators.some(msg =>
      pageText.toLowerCase().includes(msg.toLowerCase())
    );

    if (hasNoPostsMessage) {
      return { hasPost: false, postCount: 0, reason: 'No posts message found' };
    }

    let totalPostCount = 0;
    const postSelectors = [
      '[role="article"]',
      '[data-pagelet*="FeedUnit"]',
      '.x1yztbdb.x1n2onr6.xh8yej3',
      '[aria-label*="Post"]',
      '.userContentWrapper',
      '._5pcb._4b0l',
      '[data-testid="post_chevron_button"]'
    ];

    const countedPosts = new Set();

    for (const selector of postSelectors) {
      try {
        const elements = document.querySelectorAll(selector);
        for (let elem of elements) {
          const elemText = elem.innerText || '';
          const elemId = elem.getAttribute('id') || elem.getAttribute('data-testid') || elemText.substring(0, 50);

          if (elemText.length > 20 && 
              !elemText.toLowerCase().includes('no posts') &&
              !elemText.toLowerCase().includes('write something') &&
              !countedPosts.has(elemId)) {
            
            const hasPostIndicators = 
              elem.querySelector('[role="button"]') || 
              elem.querySelector('img') ||
              elem.querySelector('video') ||
              elemText.includes('Like') ||
              elemText.includes('Comment') ||
              elemText.includes('Share');
            
            if (hasPostIndicators) {
              countedPosts.add(elemId);
              totalPostCount++;
            }
          }
        }
      } catch (e) {
        continue;
      }
    }

    if (totalPostCount === 0) {
      const feedUnits = document.querySelectorAll('[data-pagelet*="FeedUnit"]');
      totalPostCount = feedUnits.length;

      if (totalPostCount === 0) {
        const articles = document.querySelectorAll('div[role="article"]');
        for (let article of articles) {
          if (article.innerText && article.innerText.length > 50) {
            totalPostCount++;
          }
        }
      }
    }

    return {
      hasPost: totalPostCount > 0,
      postCount: totalPostCount,
      reason: totalPostCount > 0 ? 'Posts found' : 'No valid post elements found'
    };

  } catch (error) {
    return { hasPost: false, postCount: 0, error: error.message };
  }
}

async function autoSaveFile() {
  if (!updatedData || !hasChanges) {
    showStatus('No changes to save', 'info');
    chrome.runtime.sendMessage({ action: 'processingCompleted' });
    return;
  }
  try {
    showStatus('Preparing file for download...', 'info');

    const cleanedData = removeColumns(updatedData, COLUMNS_TO_EXCLUDE);

    const newWorksheet = XLSX.utils.aoa_to_sheet(cleanedData);
    const firstSheetName = workbook.SheetNames[0];
    workbook.Sheets[firstSheetName] = newWorksheet;

    const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });

    await downloadFileAndClose(wbout);
  } catch (error) {
    showStatus(`Auto-save error: ${error.message}`, 'error');
    console.error('Auto-save error:', error);
    chrome.runtime.sendMessage({ action: 'processingCompleted' });
  }
}

function removeColumns(data, columnsToRemove) {
  if (!data || data.length === 0) {
    console.warn('removeColumns: No data provided');
    return data;
  }

  const headers = data[0];
  const indicesToRemove = [];

  columnsToRemove.forEach(columnName => {
    const index = headers.findIndex(header =>
      header && header.toString().toLowerCase() === columnName.toLowerCase()
    );
    if (index !== -1) {
      indicesToRemove.push(index);
      console.log(`Found column to remove: "${columnName}" at index ${index}`);
    } else {
      console.log(`Column not found: "${columnName}"`);
    }
  });

  indicesToRemove.sort((a, b) => b - a);

  const cleanedData = data.map(row => {
    const newRow = [...row];
    indicesToRemove.forEach(index => {
      if (index < newRow.length) {
        newRow.splice(index, 1);
      }
    });
    return newRow;
  });

  console.log(`Successfully removed ${indicesToRemove.length} columns: ${columnsToRemove.join(', ')}`);
  console.log(`Original columns: ${data[0].length}, Final columns: ${cleanedData[0].length}`);
  
  return cleanedData;
}

async function saveFile() {
  if (!fileHandle || !updatedData || !hasChanges) {
    showStatus('No changes to save', 'info');
    return;
  }
  try {
    saveBtn.disabled = true;
    showStatus('Preparing file for download...', 'info');

    const cleanedData = removeColumns(updatedData, COLUMNS_TO_EXCLUDE);

    const newWorksheet = XLSX.utils.aoa_to_sheet(cleanedData);
    const firstSheetName = workbook.SheetNames[0];
    workbook.Sheets[firstSheetName] = newWorksheet;

    const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });

    await downloadFileAndClose(wbout);
  } catch (error) {
    showStatus(`Save error: ${error.message}`, 'error');
    console.error('Save error:', error);
  } finally {
    saveBtn.disabled = false;
  }
}

async function downloadFileAndClose(wbout) {
  try {
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'updated_facebook_links.xlsx';

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    hasChanges = false;
    saveBtn.classList.add('hidden');
    showStatus('✅ File downloaded as updated_facebook_links.xlsx! Window will close shortly...', 'success');
    originalData = JSON.parse(JSON.stringify(updatedData));

    chrome.runtime.sendMessage({ action: 'downloadCompleted' });

  } catch (error) {
    showStatus(`Download failed: ${error.message}`, 'error');
    chrome.runtime.sendMessage({ action: 'processingCompleted' });
  }
}

function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);

    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 30000);
  });
}

function showStatus(message, type) {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`;
  statusMessage.classList.remove('hidden');
  if (type === 'success' || type === 'info') {
    setTimeout(() => {
      if (statusMessage.textContent === message) {
        statusMessage.classList.add('hidden');
      }
    }, 5000);
  }
}

function displayStatistics(stats) {
  document.getElementById('totalUrls').textContent = stats.total;
  document.getElementById('publishedCount').textContent = stats.published;
  document.getElementById('pendingCount').textContent = stats.pending;
  document.getElementById('declinedCount').textContent = stats.declined;
  document.getElementById('removedCount').textContent = stats.removed;
  document.getElementById('totalPostsCount').textContent = stats.totalPosts;
  
  statsToggleContainer.classList.remove('hidden');
  statistics.classList.remove('hidden');
  statistics.classList.add('collapsed');
  statsToggleBtn.classList.remove('active');
  statsToggleBtn.querySelector('.toggle-text').textContent = 'Show Results';
}

async function deleteAllPendingPosts() {
  if (!updatedData) {
    showStatus('No data loaded', 'warning');
    return;
  }
  
  const headers = updatedData[0];
  const urlColIndex = headers.findIndex(h => h && h.toString().toLowerCase().includes('url'));
  const stateColIndex = headers.findIndex(h => h && h.toString().toLowerCase().includes('post state'));
  
  if (urlColIndex === -1 || stateColIndex === -1) {
    showStatus('Required columns not found', 'error');
    return;
  }
  
  const pendingPosts = [];
  for (let i = 1; i < updatedData.length; i++) {
    const status = updatedData[i][stateColIndex];
    const url = updatedData[i][urlColIndex];
    if (status && status.toLowerCase() === 'pending' && url) {
      pendingPosts.push({ rowIndex: i, url: url.toString() });
    }
  }
  
  if (pendingPosts.length === 0) {
    showStatus('No pending posts found', 'info');
    return;
  }
  
  if (!confirm(`Found ${pendingPosts.length} pending post(s). Delete them all?`)) {
    return;
  }
  
  const originalAutoDelete = autoDeletePending;
  autoDeletePending = true;
  showStatus(`Deleting ${pendingPosts.length} pending post(s)...`, 'info');
  
  for (const { rowIndex, url } of pendingPosts) {
    try {
      currentStatusDiv.textContent = `Processing ${url.substring(0, 40)}...`;
      const result = await checkPostStatusAndCount(url);
      
      updatedData[rowIndex][stateColIndex] = result.status;
      hasChanges = true;
      
      await delay(2000);
    } catch (error) {
      console.error('Error processing pending post:', error);
    }
  }
  
  autoDeletePending = originalAutoDelete;
  showStatus('✅ Finished processing pending posts!', 'success');
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

document.addEventListener('DOMContentLoaded', async () => {
  if (!window.showOpenFilePicker) {
    showStatus('⚠️ Your browser doesn\'t support the File System Access API. Some features may be limited.', 'warning');
    console.warn('File System Access API not supported');
  }

  chrome.storage.local.remove('processingState');
});

window.deleteAllPendingPosts = deleteAllPendingPosts;