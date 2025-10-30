// Content script that runs on Facebook group pages
(function() {
    'use strict';
  
    // Listen for messages from popup
    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
      if (request.action === "getPostState") {
        const state = detectPostState();
        sendResponse({ state: state });
      }
      return true;
    });
  
    function detectPostState() {
      // Wait a bit for dynamic content to load
      const spans = document.querySelectorAll('span');
      
      for (let span of spans) {
        const text = span.textContent.trim();
        
        // Check for exact state matches
        if (text === "Pending") {
          return "Pending";
        } else if (text === "Published") {
          return "Published";
        } else if (text === "Declined") {
          return "Declined";
        } else if (text === "Removed") {
          return "Removed";
        }
      }
  
      // If no state found, check if there are any posts at all
      const noPosts = document.body.textContent.includes("You don't have any posts") ||
                      document.body.textContent.includes("No posts") ||
                      document.querySelector('[data-pagelet*="empty"]');
      
      if (noPosts) {
        return "No Posts";
      }
  
      return "Unknown";
    }
  
    // Auto-detect on page load (optional)
    function autoDetect() {
      if (window.location.href.includes('/my_pending_content')) {
        setTimeout(() => {
          const state = detectPostState();
          console.log("Facebook Post State Detected:", state);
        }, 2000);
      }
    }
  
    autoDetect();
  })();