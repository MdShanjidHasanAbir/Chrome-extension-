let collectedDomains = new Set();
let countries = [];
let currentCountryIndex = 0;
let currentCountry = null;

// Load countries and previously collected domains on popup open
document.addEventListener('DOMContentLoaded', () => {
  loadCountries();
  loadCollectedDomains();
});

document.getElementById('searchBtn').addEventListener('click', startSearch);
document.getElementById('downloadBtn').addEventListener('click', downloadCSV);
document.getElementById('nextCountryBtn').addEventListener('click', nextCountry);
document.getElementById('prevCountryBtn').addEventListener('click', previousCountry);
document.getElementById('clearBtn').addEventListener('click', clearAllDomains);
document.getElementById('keyword').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    startSearch();
  }
});

async function loadCountries() {
  try {
    const response = await fetch(chrome.runtime.getURL('countries.csv'));
    const csvText = await response.text();
    const lines = csvText.split('\n');
    
    countries = lines.slice(1).filter(line => line.trim()).map(line => {
      const [countryName, countryCode, googleDomain] = line.split(',');
      return {
        name: countryName,
        code: countryCode,
        googleDomain: googleDomain
      };
    });
    
    // Load last selected country from storage
    await loadLastSelectedCountry();
  } catch (error) {
    console.error('Error loading countries:', error);
    showStatus('Error loading country list', 'error');
  }
}

async function loadLastSelectedCountry() {
  try {
    const result = await chrome.storage.local.get(['lastSelectedCountryIndex']);
    const savedIndex = result.lastSelectedCountryIndex;
    
    // If we have a saved index and it's valid, use it; otherwise start from 0
    if (savedIndex !== undefined && savedIndex >= 0 && savedIndex < countries.length) {
      currentCountryIndex = savedIndex;
      currentCountry = countries[currentCountryIndex];
    } else {
      // Default to first country if no saved selection or invalid index
      currentCountryIndex = 0;
      currentCountry = countries[0];
    }
    
    document.getElementById('countryName').value = currentCountry.name;
  } catch (error) {
    console.error('Error loading last selected country:', error);
    // Fallback to first country
    currentCountryIndex = 0;
    currentCountry = countries[0];
    document.getElementById('countryName').value = currentCountry.name;
  }
}

// Load previously collected domains from storage
async function loadCollectedDomains() {
  try {
    const result = await chrome.storage.local.get(['collectedDomains']);
    if (result.collectedDomains) {
      // Convert array back to Set of domain objects
      collectedDomains = new Set(result.collectedDomains.map(domainData => 
        typeof domainData === 'string' ? { url: domainData, country: 'Unknown' } : domainData
      ));
      updateDomainCount();
    }
  } catch (error) {
    console.error('Error loading collected domains:', error);
  }
}

// Save collected domains to storage
async function saveCollectedDomains() {
  try {
    await chrome.storage.local.set({ 
      collectedDomains: Array.from(collectedDomains) 
    });
  } catch (error) {
    console.error('Error saving collected domains:', error);
  }
}

// Clear all collected domains
async function clearAllDomains() {
  if (confirm('Are you sure you want to clear all collected domains?')) {
    collectedDomains.clear();
    await saveCollectedDomains();
    updateDomainCount();
    document.getElementById('results').style.display = 'none';
    document.getElementById('downloadBtn').style.display = 'none';
    showStatus('All domains cleared!', 'success');
  }
}

// Update the domain count display
function updateDomainCount() {
  const countElement = document.getElementById('totalDomains');
  if (countElement) {
    countElement.textContent = `Total Unique Domains: ${collectedDomains.size}`;
  }
}

async function nextCountry() {
  if (countries.length === 0) return;
  
  currentCountryIndex = (currentCountryIndex + 1) % countries.length;
  currentCountry = countries[currentCountryIndex];
  document.getElementById('countryName').value = currentCountry.name;
  
  // Save the current selection to storage
  try {
    await chrome.storage.local.set({ lastSelectedCountryIndex: currentCountryIndex });
  } catch (error) {
    console.error('Error saving country selection:', error);
  }
}

async function previousCountry() {
  if (countries.length === 0) return;
  
  currentCountryIndex = currentCountryIndex === 0 ? countries.length - 1 : currentCountryIndex - 1;
  currentCountry = countries[currentCountryIndex];
  document.getElementById('countryName').value = currentCountry.name;
  
  // Save the current selection to storage
  try {
    await chrome.storage.local.set({ lastSelectedCountryIndex: currentCountryIndex });
  } catch (error) {
    console.error('Error saving country selection:', error);
  }
}

function showStatus(message, type) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = type;
  status.style.display = 'block';
}

function hideStatus() {
  document.getElementById('status').style.display = 'none';
}

async function startSearch() {
  const keyword = document.getElementById('keyword').value.trim();
  
  if (!keyword) {
    showStatus('Please enter a keyword', 'error');
    return;
  }

  if (!currentCountry) {
    showStatus('Please select a country', 'error');
    return;
  }

  document.getElementById('searchBtn').disabled = true;
  showStatus(`Starting search for "${keyword}" in ${currentCountry.name}...`, 'info');

  try {
    // Send message to background script to start the search
    const response = await chrome.runtime.sendMessage({
      action: 'startSearch',
      keyword: keyword,
      country: currentCountry
    });

    if (response.success) {
      const previousCount = collectedDomains.size;
      
      // Add new domains to existing collection (accumulate across countries)
      response.domains.forEach(domain => {
        collectedDomains.add({
          url: domain,
          country: currentCountry.name
        });
      });
      
      const newDomainsCount = collectedDomains.size - previousCount;
      const totalDomainsCount = collectedDomains.size;
      
      // Save the updated collection
      await saveCollectedDomains();
      
      showStatus(`Added ${newDomainsCount} new domains from ${currentCountry.name}. Total unique domains: ${totalDomainsCount}`, 'success');
      
      displayResults();
      updateDomainCount();
      document.getElementById('downloadBtn').style.display = 'block';
    } else {
      showStatus(response.error || 'An error occurred', 'error');
    }
  } catch (error) {
    showStatus('Error: ' + error.message, 'error');
  } finally {
    document.getElementById('searchBtn').disabled = false;
  }
}

function displayResults() {
  const resultsDiv = document.getElementById('results');
  const domains = Array.from(collectedDomains);
  const displayDomains = domains.slice(0, 20);
  
  let domainsHTML = '';
  displayDomains.forEach(domainObj => {
    domainsHTML += `<div class="domain-item">
      <div class="domain-url"><a href="${domainObj.url}" target="_blank" rel="noopener">${domainObj.url}</a></div>
      <div class="domain-country">Country: ${domainObj.country}</div>
    </div>`;
  });
  
  resultsDiv.innerHTML = `
    <div class="domain-count">Showing ${Math.min(20, collectedDomains.size)} of ${collectedDomains.size} unique domains from all countries</div>
    <div class="domains-list">${domainsHTML}</div>
    ${collectedDomains.size > 20 ? '<div class="more-info">... and more</div>' : ''}
  `;
  resultsDiv.style.display = 'block';
}

function downloadCSV() {
  const domains = Array.from(collectedDomains);
  const csv = 'Country,Full Domain URL\n' + domains.map(domainObj => `${domainObj.country},${domainObj.url}`).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  
  chrome.downloads.download({
    url: url,
    filename: `google_domains_all_countries_${new Date().getTime()}.csv`
  });
  
  showStatus('CSV file downloaded!', 'success');
}
