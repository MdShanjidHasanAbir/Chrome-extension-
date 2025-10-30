document.addEventListener("DOMContentLoaded", function () {
  const urlsTextarea = document.getElementById("urls");
  const delayInput = document.getElementById("delay");
  const openButton = document.getElementById("openUrls");
  const statusDiv = document.getElementById("status");
  const sheetUrlInput = document.getElementById("sheetUrl");
  const checkFbStatesBtn = document.getElementById("checkFbStates");

  // Load saved data
  chrome.storage.sync.get(["savedUrls", "savedDelay", "savedSheetUrl"], function (data) {
    if (data.savedUrls) {
      urlsTextarea.value = data.savedUrls;
    }
    if (data.savedDelay !== undefined) {
      delayInput.value = data.savedDelay;
    }
    if (data.savedSheetUrl) {
      sheetUrlInput.value = data.savedSheetUrl;
    }
  });

  // Save data when changed
  urlsTextarea.addEventListener("input", function () {
    chrome.storage.sync.set({ savedUrls: urlsTextarea.value });
  });

  delayInput.addEventListener("input", function () {
    chrome.storage.sync.set({ savedDelay: delayInput.value });
  });

  sheetUrlInput.addEventListener("input", function () {
    chrome.storage.sync.set({ savedSheetUrl: sheetUrlInput.value });
  });

  openButton.addEventListener("click", function () {
    const urlsText = urlsTextarea.value.trim();
    const delay = parseFloat(delayInput.value) * 1000; // Convert to milliseconds

    if (!urlsText) {
      showStatus("No URLs provided!", "error");
      return;
    }

    // Parse URLs from textarea
    const urls = urlsText
      .split("\n")
      .map((url) => url.trim())
      .filter((url) => url.length > 0);

    if (urls.length === 0) {
      showStatus("No valid URLs found!", "error");
      return;
    }

    // Validate URLs
    const invalidUrls = [];
    const validUrls = urls.filter((url) => {
      try {
        new URL(url);
        return true;
      } catch (e) {
        // Try adding https:// if no protocol is specified
        try {
          new URL("https://" + url);
          return true;
        } catch (e2) {
          invalidUrls.push(url);
          return false;
        }
      }
    });

    if (invalidUrls.length > 0) {
      showStatus(`Invalid URLs found: ${invalidUrls.join(", ")}`, "error");
      return;
    }

    // Disable button and show progress
    openButton.disabled = true;
    showStatus(`Opening ${validUrls.length} URLs...`, "info");

    // Open URLs one by one
    openUrlsSequentially(validUrls, delay)
      .then(() => {
        showStatus(`Successfully opened ${validUrls.length} URLs!`, "success");
        openButton.disabled = false;

        // Auto close popup after success (optional)
        setTimeout(() => {
          window.close();
        }, 1500);
      })
      .catch((error) => {
        showStatus(`Error: ${error.message}`, "error");
        openButton.disabled = false;
      });
  });

  function openUrlsSequentially(urls, delay) {
    return new Promise((resolve, reject) => {
      let index = 0;

      function openNext() {
        if (index >= urls.length) {
          resolve();
          return;
        }

        let url = urls[index];

        // Add protocol if missing
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
          url = "https://" + url;
        }

        // Update status with current progress
        showStatus(`Opening (${index + 1}/${urls.length}): ${url}`, "info");

        chrome.tabs.create({ url: url, active: false }, function (tab) {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          index++;

          if (index < urls.length) {
            setTimeout(openNext, delay);
          } else {
            resolve();
          }
        });
      }

      openNext();
    });
  }

  function showStatus(message, type = "info") {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
  }

  // Add keyboard shortcut (Ctrl+Enter or Cmd+Enter)
  urlsTextarea.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      openButton.click();
    }
  });

  // --- Facebook Post State Checker & Google Sheet Integration ---

  checkFbStatesBtn.addEventListener("click", async function () {
    const urlsText = urlsTextarea.value.trim();
    const sheetUrl = sheetUrlInput.value.trim();
    const delay = parseFloat(delayInput.value) * 1000;

    if (!urlsText) {
      showStatus("No URLs provided!", "error");
      return;
    }
    if (!sheetUrl) {
      showStatus("No Google Sheet link provided!", "error");
      return;
    }

    // Parse URLs
    const urls = urlsText
      .split("\n")
      .map((url) => url.trim())
      .filter((url) => url.length > 0 && url.includes("/my_pending_content"));

    if (urls.length === 0) {
      showStatus("No valid Facebook group /my_pending_content URLs found!", "error");
      return;
    }

    checkFbStatesBtn.disabled = true;
    showStatus(`Checking ${urls.length} Facebook group posts...`, "info");

    // Get Sheet ID and range
    const sheetIdMatch = sheetUrl.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!sheetIdMatch) {
      showStatus("Invalid Google Sheet link!", "error");
      checkFbStatesBtn.disabled = false;
      return;
    }
    const sheetId = sheetIdMatch[1];

    // Get access token for Google Sheets API
    let token;
    try {
      token = await getGoogleAuthToken();
    } catch (e) {
      showStatus("Google authentication failed: " + e.message, "error");
      checkFbStatesBtn.disabled = false;
      return;
    }

    // Get Sheet data (assume first sheet)
    let sheetData, sheetName;
    try {
      const metaRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties`,
        { headers: { Authorization: "Bearer " + token } }
      );
      const meta = await metaRes.json();
      sheetName = meta.sheets[0].properties.title;

      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(sheetName)}?majorDimension=ROWS`,
        { headers: { Authorization: "Bearer " + token } }
      );
      sheetData = await res.json();
    } catch (e) {
      showStatus("Failed to fetch Google Sheet: " + e.message, "error");
      checkFbStatesBtn.disabled = false;
      return;
    }

    // Find columns
    const headers = sheetData.values[0];
    const urlCol = headers.findIndex(h => /url/i.test(h));
    const stateCol = headers.findIndex(h => /post state/i.test(h));
    if (urlCol === -1 || stateCol === -1) {
      showStatus("Sheet must have 'URL' and 'Post State' columns!", "error");
      checkFbStatesBtn.disabled = false;
      return;
    }

    // For each URL, open tab, get state, update sheet
    for (let i = 0; i < urls.length; i++) {
      let url = urls[i].startsWith("http") ? urls[i] : "https://" + urls[i];
      showStatus(`(${i+1}/${urls.length}) Checking: ${url}`, "info");

      // Open tab, inject content script, get state
      let tabId;
      try {
        const tab = await new Promise((resolve, reject) => {
          chrome.tabs.create({ url, active: false }, tab => {
            if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
            else resolve(tab);
          });
        });
        tabId = tab.id;

        // Wait for content script to send state
        const state = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("Timeout waiting for Facebook state")), 15000);
          chrome.runtime.onMessage.addListener(function listener(msg, sender) {
            if (msg.type === "FB_POST_STATE" && sender.tab && sender.tab.id === tabId) {
              chrome.runtime.onMessage.removeListener(listener);
              clearTimeout(timeout);
              resolve(msg.state);
            }
          });
        });

        // Find row in sheet
        const rowIdx = sheetData.values.findIndex(row => (row[urlCol] || "").trim() === url.trim());
        if (rowIdx === -1) {
          showStatus(`URL not found in sheet: ${url}`, "error");
          chrome.tabs.remove(tabId);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        // Update sheet
        const colLetter = String.fromCharCode(65 + stateCol);
        const range = `${sheetName}!${colLetter}${rowIdx + 1}`;
        await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
          {
            method: "PUT",
            headers: {
              "Authorization": "Bearer " + token,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ values: [[state]] })
          }
        );

        // Close tab
        chrome.tabs.remove(tabId);

      } catch (e) {
        showStatus(`Error for ${url}: ${e.message}`, "error");
        if (tabId) chrome.tabs.remove(tabId);
      }

      await new Promise(r => setTimeout(r, delay));
    }

    showStatus("All Facebook post states checked and updated!", "success");
    checkFbStatesBtn.disabled = false;
  });

  function getGoogleAuthToken() {
    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, function(token) {
        if (chrome.runtime.lastError || !token) {
          reject(chrome.runtime.lastError || new Error("No token"));
        } else {
          resolve(token);
        }
      });
    });
  }
});