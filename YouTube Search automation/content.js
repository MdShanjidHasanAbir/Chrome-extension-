// Listen for search commands from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'performSearch') {
      performSearch(request.keyword);
    }
  });
  
  function performSearch(keyword) {
    // Method 1: Try to use the search box
    const searchBox = document.querySelector('input#search');
    const searchButton = document.querySelector('#search-icon-legacy');
    
    if (searchBox && searchButton) {
      searchBox.value = keyword;
      searchBox.dispatchEvent(new Event('input', { bubbles: true }));
      
      // Click search button
      setTimeout(() => {
        searchButton.click();
      }, 500);
    } else {
      // Method 2: Navigate directly to search URL
      window.location.href = `https://www.youtube.com/results?search_query=${encodeURIComponent(keyword)}`;
    }
  }