(function() {
    function detectState() {
      // Look for the state text in the DOM
      const stateTexts = ["Pending", "Published", "Declined", "Removed"];
      let found = null;
      stateTexts.forEach(state => {
        // Find span with exact text
        const el = Array.from(document.querySelectorAll("span"))
          .find(span => span.textContent.trim() === state);
        if (el) found = state;
      });
      return found || "Unknown";
    }
  
    // Wait for DOM to load
    function tryDetect(attempts = 0) {
      const state = detectState();
      if (state !== "Unknown" || attempts > 10) {
        chrome.runtime.sendMessage({ type: "FB_POST_STATE", state });
      } else {
        setTimeout(() => tryDetect(attempts+1), 1000);
      }
    }
    tryDetect();
  })();