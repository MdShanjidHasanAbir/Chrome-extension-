let automationInterval = null;
let currentKeywordIndex = 0;
let isAutomationRunning = false;

// Initialize storage
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    keywords: [],
    isRunning: false,
    currentIndex: 0
  });
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startAutomation') {
    startAutomation();
    sendResponse({ success: true });
  } else if (request.action === 'stopAutomation') {
    stopAutomation();
    sendResponse({ success: true });
  } else if (request.action === 'getStatus') {
    sendResponse({ isRunning: isAutomationRunning });
  }
});

function startAutomation() {
  if (isAutomationRunning) return;
  
  isAutomationRunning = true;
  chrome.storage.local.set({ isRunning: true });
  
  // Perform first search immediately
  performNextSearch();
  
  // Set interval for subsequent searches (5 minutes = 300000 ms)
  automationInterval = setInterval(() => {
    performNextSearch();
  }, 300000);
}

function stopAutomation() {
  if (automationInterval) {
    clearInterval(automationInterval);
    automationInterval = null;
  }
  isAutomationRunning = false;
  chrome.storage.local.set({ isRunning: false });
}

async function performNextSearch() {
  try {
    // Get current keywords and index
    const data = await chrome.storage.local.get(['keywords', 'currentIndex']);
    const keywords = data.keywords || [];
    
    if (keywords.length === 0) {
      console.log('No keywords to search');
      stopAutomation();
      return;
    }
    
    // Get current index
    currentKeywordIndex = data.currentIndex || 0;
    if (currentKeywordIndex >= keywords.length) {
      currentKeywordIndex = 0;
    }
    
    const keyword = keywords[currentKeywordIndex];
    
    // Find YouTube tabs
    const tabs = await chrome.tabs.query({ url: 'https://www.youtube.com/*' });
    
    if (tabs.length > 0) {
      // Use the first YouTube tab found
      const tab = tabs[0];
      
      // Send search command to content script
      chrome.tabs.sendMessage(tab.id, {
        action: 'performSearch',
        keyword: keyword
      });
      
      // Update index for next search
      currentKeywordIndex = (currentKeywordIndex + 1) % keywords.length;
      chrome.storage.local.set({ currentIndex: currentKeywordIndex });
      
      console.log(`Searched for: ${keyword}`);
    } else {
      console.log('No YouTube tab found');
      // Open a new YouTube tab
      chrome.tabs.create({ url: 'https://www.youtube.com' }, (tab) => {
        // Wait a bit for the page to load, then search
        setTimeout(() => {
          chrome.tabs.sendMessage(tab.id, {
            action: 'performSearch',
            keyword: keyword
          });
        }, 3000);
      });
    }
  } catch (error) {
    console.error('Error performing search:', error);
  }
}