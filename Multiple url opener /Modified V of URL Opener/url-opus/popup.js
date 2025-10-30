document.addEventListener("DOMContentLoaded", function () {
  const urlsTextarea = document.getElementById("urls");
  const delayInput = document.getElementById("delay");
  const openButton = document.getElementById("openUrls");
  const statusDiv = document.getElementById("status");
  const checkFbPostsCheckbox = document.getElementById("checkFbPosts");
  const sheetUrlGroup = document.getElementById("sheetUrlGroup");
  const sheetUrlInput = document.getElementById("sheetUrl");
  const authorizeButton = document.getElementById("authorizeGoogle");
  const progressDiv = document.getElementById("progress");
  const progressDetails = document.getElementById("progressDetails");

  // Load saved data
  chrome.storage.sync.get(["savedUrls", "savedDelay", "checkFbPosts", "sheetUrl"], function (data) {
    if (data.savedUrls) {
      urlsTextarea.value = data.savedUrls;
    }
    if (data.savedDelay !== undefined) {
      delayInput.value = data.savedDelay;
    }
    if (data.checkFbPosts) {
      checkFbPostsCheckbox.checked = data.checkFbPosts;
      sheetUrlGroup.style.display = "block";
    }
    if (data.sheetUrl) {
      sheetUrlInput.value = data.sheetUrl;
    }
  });

  // Toggle sheet URL input based on checkbox
  checkFbPostsCheckbox.addEventListener("change", function () {
    chrome.storage.sync.set({ checkFbPosts: checkFbPostsCheckbox.checked });
    sheetUrlGroup.style.display = checkFbPostsCheckbox.checked ? "block" : "none";
    
    if (checkFbPostsCheckbox.checked) {
      checkGoogleAuth();
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
    chrome.storage.sync.set({ sheetUrl: sheetUrlInput.value });
  });

  // Check Google auth status
  function checkGoogleAuth() {
    chrome.runtime.sendMessage({ action: "checkAuth" }, function (response) {
      if (response && response.authorized) {
        authorizeButton.style.display = "none";
      } else {
        authorizeButton.style.display = "block";
      }
    });
  }

  // Authorize Google
  authorizeButton.addEventListener("click", function () {
    chrome.runtime.sendMessage({ action: "authorize" }, function (response) {
      if (response && response.success) {
        authorizeButton.style.display = "none";
        showStatus("Successfully authorized Google Sheets!", "success");
      } else {
        showStatus("Authorization failed. Please try again.", "error");
      }
    });
  });

  openButton.addEventListener("click", async function () {
    const urlsText = urlsTextarea.value.trim();
    const delay = parseFloat(delayInput.value) * 1000;
    const checkFbPosts = checkFbPostsCheckbox.checked;
    const sheetUrl = sheetUrlInput.value.trim();

    if (!urlsText) {
      showStatus("No URLs provided!", "error");
      return;
    }

    if (checkFbPosts && !sheetUrl) {
      showStatus("Please provide a Google Sheet URL!", "error");
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

    // Extract sheet ID from URL
    let sheetId = null;
    if (checkFbPosts) {
      const sheetMatch = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      if (!sheetMatch) {
        showStatus("Invalid Google Sheet URL!", "error");
        return;
      }
      sheetId = sheetMatch[1];
    }

    // Disable button and show progress
    openButton.disabled = true;
    progressDiv.classList.add("active");
    progressDetails.innerHTML = "";
    showStatus(`Processing ${urls.length} URLs...`, "info");

    try {
      if (checkFbPosts) {
        await processUrlsWithFbCheck(urls, delay, sheetId);
      } else {
        await openUrlsSequentially(urls, delay);
      }
      
      showStatus(`Successfully processed ${urls.length} URLs!`, "success");
      progressDiv.classList.remove("active");
      
      // Auto close popup after success
      setTimeout(() => {
        window.close();
      }, 2000);
    } catch (error) {
      showStatus(`Error: ${error.message}`, "error");
      progressDiv.classList.remove("active");
    } finally {
      openButton.disabled = false;
    }
  });

  async function processUrlsWithFbCheck(urls, delay, sheetId) {
    const results = [];
    
    for (let i = 0; i < urls.length; i++) {
      let url = urls[i];
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        url = "https://" + url;
      }

      updateProgress(`Opening (${i + 1}/${urls.length}): ${url}`);

      const tab = await createTab(url);
      
      // Wait for page to load
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check if it's a Facebook group pending content page
      if (url.includes("facebook.com/groups/") && url.includes("/my_pending_content")) {
        updateProgress(`Checking post state for: ${url}`);
        
        const postState = await checkFacebookPostState(tab.id);
        results.push({ url, postState, row: i + 2 }); // Row index starts at 2 (after header)
        
        updateProgress(`Post state detected: ${postState || "Unknown"}`);
      }

      if (i < urls.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // Update Google Sheet with results
    if (results.length > 0) {
      updateProgress("Updating Google Sheet...");
      await updateGoogleSheet(sheetId, results);
    }
  }

  function createTab(url) {
    return new Promise((resolve, reject) => {
      chrome.tabs.create({ url: url, active: false }, function (tab) {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(tab);
        }
      });
    });
  }

  function checkFacebookPostState(tabId) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { action: "checkPostState" }, function (response) {
        if (chrome.runtime.lastError || !response) {
          resolve("Unknown");
        } else {
          resolve(response.postState);
        }
      });
    });
  }

  async function updateGoogleSheet(sheetId, results) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          action: "updateSheet",
          sheetId: sheetId,
          results: results
        },
        function (response) {
          if (response && response.success) {
            resolve();
          } else {
            reject(new Error(response ? response.error : "Failed to update sheet"));
          }
        }
      );
    });
  }

  function openUrlsSequentially(urls, delay) {
    return new Promise((resolve, reject) => {
      let index = 0;

      function openNext() {
        if (index >= urls.length) {
          resolve();
          return;
        }

        let url = urls[index];
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
          url = "https://" + url;
        }

        updateProgress(`Opening (${index + 1}/${urls.length}): ${url}`);

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

  function updateProgress(message) {
    const item = document.createElement("div");
    item.className = "progress-item";
    item.textContent = `• ${message}`;
    progressDetails.appendChild(item);
    progressDetails.scrollTop = progressDetails.scrollHeight;
  }

  // Check auth on load if FB checking is enabled
  if (checkFbPostsCheckbox.checked) {
    checkGoogleAuth();
  }
});