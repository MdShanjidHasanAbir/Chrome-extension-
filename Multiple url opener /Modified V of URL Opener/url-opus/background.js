// Background script for Google Sheets API integration

// Check if user is authorized
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "checkAuth") {
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        sendResponse({ authorized: !!token });
      });
      return true;
    }
  
    if (request.action === "authorize") {
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError || !token) {
          sendResponse({ success: false, error: chrome.runtime.lastError });
        } else {
          sendResponse({ success: true });
        }
      });
      return true;
    }
  
    if (request.action === "updateSheet") {
      updateGoogleSheet(request.sheetId, request.results)
        .then(() => sendResponse({ success: true }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;
    }
  });
  
  async function updateGoogleSheet(sheetId, results) {
    // Get auth token
    const token = await new Promise((resolve) => {
      chrome.identity.getAuthToken({ interactive: false }, resolve);
    });
  
    if (!token) {
      throw new Error("Not authorized");
    }
  
    // First, find the column index for "Post State"
    const rangeResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/1:1`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
  
    if (!rangeResponse.ok) {
      throw new Error("Failed to read sheet headers");
    }
  
    const headerData = await rangeResponse.json();
    const headers = headerData.values?.[0] || [];
    const postStateColumnIndex = headers.findIndex(
      (header) => header.toLowerCase() === "post state"
    );
  
    if (postStateColumnIndex === -1) {
      throw new Error("Could not find 'Post State' column in the sheet");
    }
  
    // Convert column index to letter (0 -> A, 1 -> B, etc.)
    const columnLetter = String.fromCharCode(65 + postStateColumnIndex);
  
    // Prepare batch update data
    const data = results.map((result) => ({
      range: `${columnLetter}${result.row}`,
      values: [[result.postState]],
    }));
  
    // Update the sheet
    const updateResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          valueInputOption: "USER_ENTERED",
          data: data,
        }),
      }
    );
  
    if (!updateResponse.ok) {
      const error = await updateResponse.json();
      throw new Error(error.error?.message || "Failed to update sheet");
    }
  
    return true;
  }