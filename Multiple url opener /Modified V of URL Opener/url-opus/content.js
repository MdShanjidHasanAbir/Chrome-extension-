// Content script for Facebook post state detection
(function() {
    // Function to detect post state
    function detectPostState() {
      // Define the possible states and their text identifiers
      const states = ["Pending", "Published", "Declined", "Removed"];
      
      // Try multiple selectors to find the state
      const selectors = [
        'span.x193iq5w.xeuugli.x13faqbe.x1vvkbs.x1xmvt09.x6prxxf.xvq8zen.xk50ysn.xzsf02u',
        'span[class*="x193iq5w"][class*="xeuugli"]',
        'div.x78zum5.xdt5ytf.xz62fqu.x16ldp7u span'
      ];
      
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        
        for (const element of elements) {
          const text = element.textContent.trim();
          if (states.includes(text)) {
            return text;
          }
        }
      }
      
      // If no state found, wait a bit and try again (page might still be loading)
      return null;
    }
  
    // Listen for messages from the extension
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "checkPostState") {
        // Try to detect state multiple times with delays
        let attempts = 0;
        const maxAttempts = 10;
        
        const checkState = () => {
          attempts++;
          const state = detectPostState();
          
          if (state) {
            sendResponse({ postState: state });
          } else if (attempts < maxAttempts) {
            setTimeout(checkState, 1000); // Wait 1 second and try again
          } else {
            sendResponse({ postState: "Unknown" });
          }
        };
        
        checkState();
        return true; // Keep the message channel open for async response
      }
    });
  })();