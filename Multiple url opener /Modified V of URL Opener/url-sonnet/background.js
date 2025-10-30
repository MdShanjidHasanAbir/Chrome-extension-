// Background service worker for handling Google Sheets updates

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === "updateGoogleSheet") {
      updateGoogleSheet(request.sheetUrl, request.results)
        .then(() => {
          sendResponse({ success: true });
        })
        .catch((error) => {
          sendResponse({ success: false, error: error.message });
        });
      return true; // Required for async sendResponse
    }
  });
  
  async function updateGoogleSheet(sheetUrl, results) {
    try {
      // Extract spreadsheet ID from URL
      const match = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (!match) {
        throw new Error("Invalid Google Sheets URL");
      }
      
      const spreadsheetId = match[1];
      
      // Note: This is a simplified implementation
      // For actual Google Sheets API integration, you would need:
      // 1. OAuth2 authentication
      // 2. Google Sheets API enabled
      // 3. Proper API credentials
      
      console.log("Updating Google Sheet:", spreadsheetId);
      console.log("Results to update:", results);
      
      // Store results in local storage as a backup
      chrome.storage.local.set({
        lastSheetUpdate: {
          timestamp: new Date().toISOString(),
          sheetUrl: sheetUrl,
          results: results
        }
      });
      
    } catch (error) {
      console.error("Error updating Google Sheet:", error);
      throw error;
    }
  }
        