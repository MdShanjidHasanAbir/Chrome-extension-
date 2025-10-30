document.addEventListener("DOMContentLoaded", function () {
  // Tab switching
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.dataset.tab;
      
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(tc => tc.classList.remove('active'));
      
      tab.classList.add('active');
      document.getElementById(tabId).classList.add('active');
    });
  });

  // ========== URL OPENER TAB ==========
  const urlsTextarea = document.getElementById("urls");
  const delayInput = document.getElementById("delay");
  const openButton = document.getElementById("openUrls");
  const statusDiv = document.getElementById("status");

  // Load saved data
  chrome.storage.sync.get(["savedUrls", "savedDelay"], function (data) {
    if (data.savedUrls) {
      urlsTextarea.value = data.savedUrls;
    }
    if (data.savedDelay !== undefined) {
      delayInput.value = data.savedDelay;
    }
  });

  // Save data when changed
  urlsTextarea.addEventListener("input", function () {
    chrome.storage.sync.set({ savedUrls: urlsTextarea.value });
  });

  delayInput.addEventListener("input", function () {
    chrome.storage.sync.set({ savedDelay: delayInput.value });
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

  // ========== FACEBOOK POST CHECKER TAB ==========
  const fbUrlsTextarea = document.getElementById("fbUrls");
  const sheetUrlInput = document.getElementById("sheetUrl");
  const fbDelayInput = document.getElementById("fbDelay");
  const autoCloseCheckbox = document.getElementById("autoClose");
  const checkFbButton = document.getElementById("checkFbPosts");
  const fbStatusDiv = document.getElementById("fbStatus");
  const resultTableDiv = document.getElementById("resultTable");

  // Load saved FB checker data
  chrome.storage.sync.get(["savedFbUrls", "savedSheetUrl", "savedFbDelay", "savedAutoClose"], function (data) {
    if (data.savedFbUrls) {
      fbUrlsTextarea.value = data.savedFbUrls;
    }
    if (data.savedSheetUrl) {
      sheetUrlInput.value = data.savedSheetUrl;
    }
    if (data.savedFbDelay !== undefined) {
      fbDelayInput.value = data.savedFbDelay;
    }
    if (data.savedAutoClose !== undefined) {
      autoCloseCheckbox.checked = data.savedAutoClose;
    }
  });

  // Save FB data when changed
  fbUrlsTextarea.addEventListener("input", function () {
    chrome.storage.sync.set({ savedFbUrls: fbUrlsTextarea.value });
  });

  sheetUrlInput.addEventListener("input", function () {
    chrome.storage.sync.set({ savedSheetUrl: sheetUrlInput.value });
  });

  fbDelayInput.addEventListener("input", function () {
    chrome.storage.sync.set({ savedFbDelay: fbDelayInput.value });
  });

  autoCloseCheckbox.addEventListener("change", function () {
    chrome.storage.sync.set({ savedAutoClose: autoCloseCheckbox.checked });
  });

  checkFbButton.addEventListener("click", function () {
    const fbUrlsText = fbUrlsTextarea.value.trim();
    const sheetUrl = sheetUrlInput.value.trim();
    const delay = parseFloat(fbDelayInput.value) * 1000;
    const autoClose = autoCloseCheckbox.checked;

    if (!fbUrlsText) {
      showFbStatus("No Facebook URLs provided!", "error");
      return;
    }

    if (!sheetUrl) {
      showFbStatus("Please provide Google Sheet URL!", "error");
      return;
    }

    // Validate sheet URL
    if (!sheetUrl.includes("docs.google.com/spreadsheets")) {
      showFbStatus("Invalid Google Sheets URL!", "error");
      return;
    }

    // Parse Facebook URLs
    const fbUrls = fbUrlsText
      .split("\n")
      .map((url) => url.trim())
      .filter((url) => url.length > 0);

    if (fbUrls.length === 0) {
      showFbStatus("No valid Facebook URLs found!", "error");
      return;
    }

    // Validate Facebook URLs
    const invalidFbUrls = fbUrls.filter(url => 
      !url.includes("facebook.com/groups/") || !url.includes("/my_pending_content")
    );

    if (invalidFbUrls.length > 0) {
      showFbStatus("Some URLs are not valid Facebook group /my_pending_content URLs!", "error");
      return;
    }

    // Disable button and show progress
    checkFbButton.disabled = true;
    showFbStatus(`Checking ${fbUrls.length} Facebook groups...`, "info");
    resultTableDiv.style.display = "none";
    resultTableDiv.innerHTML = "";

    // Start checking posts
    checkFacebookPosts(fbUrls, sheetUrl, delay, autoClose);
  });

  function checkFacebookPosts(urls, sheetUrl, delay, autoClose) {
    const results = [];
    let currentIndex = 0;

    function checkNext() {
      if (currentIndex >= urls.length) {
        // All checks complete
        displayResults(results);
        updateGoogleSheet(sheetUrl, results);
        checkFbButton.disabled = false;
        showFbStatus(`Completed! Checked ${results.length} groups.`, "success");
        return;
      }

      const url = urls[currentIndex];
      const groupName = extractGroupName(url);
      
      showFbStatus(`Checking (${currentIndex + 1}/${urls.length}): ${groupName}...`, "info");

      // Open tab and inject content script
      chrome.tabs.create({ url: url, active: false }, function (tab) {
        if (chrome.runtime.lastError) {
          results.push({
            url: url,
            groupName: groupName,
            state: "Error",
            error: chrome.runtime.lastError.message
          });
          currentIndex++;
          setTimeout(checkNext, 1000);
          return;
        }

        const tabId = tab.id;

        // Wait for page to load, then check state
        setTimeout(() => {
          chrome.tabs.sendMessage(tabId, { action: "getPostState" }, function (response) {
            if (chrome.runtime.lastError || !response) {
              results.push({
                url: url,
                groupName: groupName,
                state: "Unknown",
                error: "Could not detect state"
              });
            } else {
              results.push({
                url: url,
                groupName: groupName,
                state: response.state
              });
            }

            // Close tab if auto-close is enabled
            if (autoClose) {
              chrome.tabs.remove(tabId);
            }

            currentIndex++;
            setTimeout(checkNext, delay);
          });
        }, delay);
      });
    }

    checkNext();
  }

  function extractGroupName(url) {
    try {
      const match = url.match(/facebook\.com\/groups\/([^\/]+)/);
      return match ? match[1] : "Unknown Group";
    } catch (e) {
      return "Unknown Group";
    }
  }

  function displayResults(results) {
    if (results.length === 0) return;

    resultTableDiv.innerHTML = "";
    results.forEach(result => {
      const row = document.createElement("div");
      row.className = "result-row";
      
      const groupNameSpan = document.createElement("span");
      groupNameSpan.className = "group-name";
      groupNameSpan.textContent = result.groupName;
      groupNameSpan.title = result.url;
      
      const stateSpan = document.createElement("span");
      stateSpan.className = `state ${result.state.toLowerCase()}`;
      stateSpan.textContent = result.state;
      
      row.appendChild(groupNameSpan);
      row.appendChild(stateSpan);
      resultTableDiv.appendChild(row);
    });

    resultTableDiv.style.display = "block";
  }

  function updateGoogleSheet(sheetUrl, results) {
    // Send message to background script to update Google Sheet
    chrome.runtime.sendMessage({
      action: "updateGoogleSheet",
      sheetUrl: sheetUrl,
      results: results
    }, function (response) {
      if (response && response.success) {
        console.log("Google Sheet updated successfully");
      } else {
        console.error("Failed to update Google Sheet:", response ? response.error : "Unknown error");
      }
    });
  }

  function showFbStatus(message, type = "info") {
    fbStatusDiv.textContent = message;
    fbStatusDiv.className = `status ${type}`;
  }

  // Add keyboard shortcut for FB checker
  fbUrlsTextarea.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      checkFbButton.click();
    }
  });
});