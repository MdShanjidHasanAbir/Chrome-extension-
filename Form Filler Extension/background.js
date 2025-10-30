// Background script for handling extension installation and updates
chrome.runtime.onInstalled.addListener(() => {
    console.log('Form Auto-Filler extension installed');
    
    // Initialize storage
    chrome.storage.local.get(['fieldMappings'], (result) => {
        if (!result.fieldMappings) {
            chrome.storage.local.set({ fieldMappings: {} });
        }
    });
});

// Handle any background tasks if needed
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Add any background processing here if needed
    return true;
});