chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startSearch') {
    performSearch(request.keyword, request.country).then(sendResponse);
    return true; // Will respond asynchronously
  }
});

async function performSearch(keyword, country) {
  const domains = new Set();
  // Use country-specific Google domain
  const googleDomain = country.googleDomain || 'google.com';
  const baseUrl = `https://www.${googleDomain}/search`;
  
  try {
    // Create a new tab for searching
    const tab = await chrome.tabs.create({ url: `${baseUrl}?q=${encodeURIComponent(keyword)}`, active: false });
    
    // Wait for the page to load completely
    await waitForTabLoad(tab.id);
    
    // Ensure content script is injected
    await ensureContentScriptInjected(tab.id);
    
    // Collect domains from 5 pages
    for (let page = 0; page < 5; page++) {
      if (page > 0) {
        // Navigate to next page
        const nextPageUrl = `${baseUrl}?q=${encodeURIComponent(keyword)}&start=${page * 10}`;
        await chrome.tabs.update(tab.id, { url: nextPageUrl });
        await waitForTabLoad(tab.id);
        await ensureContentScriptInjected(tab.id);
      }
      
      // Extract domains from current page with retry logic
      try {
        const results = await sendMessageWithRetry(tab.id, { action: 'extractDomains' });
        if (results && results.domains) {
          results.domains.forEach(domain => domains.add(domain));
        }
      } catch (extractError) {
        console.log(`Domain extraction failed for page ${page + 1}:`, extractError.message);
        // Continue to next page even if this one failed
      }
    }
    
    // Close the tab
    await chrome.tabs.remove(tab.id);
    
    return { success: true, domains: Array.from(domains) };
  } catch (error) {
    console.error('Search error:', error);
    return { success: false, error: error.message };
  }
}

// Helper function to wait for tab to load completely
async function waitForTabLoad(tabId, maxRetries = 30) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const tab = await chrome.tabs.get(tabId);
      
      // Check if tab is complete or if it's been loading for a reasonable time
      if (tab.status === 'complete' || i > 10) {
        // Additional wait for dynamic content to load
        await new Promise(resolve => setTimeout(resolve, 1500));
        return;
      }
      
      // If tab is still loading, wait a bit more
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.log(`Tab load check ${i + 1} failed:`, error.message);
      // If we can't get tab info, wait and try again
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  // If we get here, the tab might still be loading but we'll proceed anyway
  console.log('Tab loading timeout reached, proceeding anyway...');
  await new Promise(resolve => setTimeout(resolve, 2000));
}

// Helper function to ensure content script is injected
async function ensureContentScriptInjected(tabId, maxRetries = 8) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      // First, try to ping existing content script
      const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' }, { frameId: 0 });
      if (response && response.ready) {
        return; // Content script is already working
      }
    } catch (error) {
      // Content script not ready, try to inject it
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tabId, allFrames: false },
          files: ['content.js']
        });
        
        // Wait for script to initialize
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Test if it's working
        const testResponse = await chrome.tabs.sendMessage(tabId, { action: 'ping' }, { frameId: 0 });
        if (testResponse && testResponse.ready) {
          return; // Successfully injected and working
        }
      } catch (injectError) {
        console.log(`Content script injection attempt ${i + 1} failed:`, injectError.message);
      }
    }
    
    // Wait before retry with increasing delay
    const delay = Math.min(1000 + (i * 500), 3000);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  // If all attempts failed, try one more time with a longer wait
  try {
    await new Promise(resolve => setTimeout(resolve, 3000));
    await chrome.scripting.executeScript({
      target: { tabId: tabId, allFrames: false },
      files: ['content.js']
    });
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const finalTest = await chrome.tabs.sendMessage(tabId, { action: 'ping' }, { frameId: 0 });
    if (finalTest && finalTest.ready) {
      return;
    }
  } catch (finalError) {
    console.log('Final injection attempt failed:', finalError.message);
  }
  
  throw new Error('Failed to inject content script after multiple attempts');
}

// Helper function to send message with retry logic
async function sendMessageWithRetry(tabId, message, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await chrome.tabs.sendMessage(tabId, message, { frameId: 0 });
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}