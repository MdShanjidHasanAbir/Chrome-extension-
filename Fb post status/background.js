// background.js - Persistent window management

let extensionWindowId = null;
let isProcessing = false;

// Listen for extension icon click
chrome.action.onClicked.addListener(async () => {
  // Check if extension window already exists
  if (extensionWindowId !== null) {
    try {
      const window = await chrome.windows.get(extensionWindowId);
      // Window exists, focus it
      chrome.windows.update(extensionWindowId, { focused: true });
      return;
    } catch (error) {
      // Window doesn't exist anymore, create new one
      extensionWindowId = null;
    }
  }

  // Create new window with the extension UI - HALF SIZE
  const window = await chrome.windows.create({
    url: 'popup.html',
    type: 'popup',
    width: 260,
    height: 375,
    focused: true
  });

  extensionWindowId = window.id;
});

// Listen for window close
chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === extensionWindowId) {
    if (isProcessing) {
      // Notify user that processing was interrupted
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon48.png',
        title: 'Processing Interrupted',
        message: 'Extension window was closed during processing. Please restart the process.'
      }).catch(() => {});
    }
    extensionWindowId = null;
    isProcessing = false;
  }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'processingStarted') {
    isProcessing = true;
    sendResponse({ status: 'acknowledged' });
  } 
  else if (message.action === 'processingCompleted') {
    isProcessing = false;
    sendResponse({ status: 'acknowledged' });
  } 
  else if (message.action === 'downloadCompleted') {
    isProcessing = false;
    // Close the window after download
    if (extensionWindowId !== null) {
      setTimeout(() => {
        chrome.windows.remove(extensionWindowId).catch(() => {});
        extensionWindowId = null;
      }, 1500); // Small delay to show success message
    }
    sendResponse({ status: 'acknowledged' });
  } 
  else if (message.action === 'manualDownloadCompleted') {
    // Manual download - close window immediately after showing success
    if (extensionWindowId !== null) {
      setTimeout(() => {
        chrome.windows.remove(extensionWindowId).catch(() => {});
        extensionWindowId = null;
      }, 1500);
    }
    sendResponse({ status: 'acknowledged' });
  }
  else if (message.action === 'getWindowId') {
    sendResponse({ windowId: extensionWindowId });
  }
  return true;
});