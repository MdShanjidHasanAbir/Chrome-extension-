chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extractDomains') {
      const domains = extractDomainsFromPage();
      sendResponse({ domains: domains });
    } else if (request.action === 'ping') {
      // Respond to ping to indicate content script is ready
      sendResponse({ ready: true });
    }
  });
  
  function extractDomainsFromPage() {
    const domains = new Set();
    
    // Wait a bit for dynamic content to load
    const waitForContent = () => {
      return new Promise(resolve => {
        setTimeout(() => {
          // Try multiple selectors for search results
          const selectors = [
            'div#search a[href]',
            'div[data-ved] a[href]',
            'h3 a[href]',
            '.g a[href]',
            'a[href*="http"]'
          ];
          
          let allLinks = [];
          selectors.forEach(selector => {
            const links = document.querySelectorAll(selector);
            allLinks = allLinks.concat(Array.from(links));
          });
          
          // Remove duplicates
          const uniqueLinks = [...new Set(allLinks)];
          
          uniqueLinks.forEach(link => {
            const href = link.getAttribute('href');
            if (href && href.startsWith('http')) {
              try {
                const url = new URL(href);
                // Get the full domain URL (protocol + hostname)
                let fullDomain = `${url.protocol}//${url.hostname}/`;
                // Only add if it's not a Google domain
                if (!url.hostname.includes('google.') && url.hostname.length > 0) {
                  domains.add(fullDomain);
                }
              } catch (e) {
                // Invalid URL, skip
              }
            }
          });
          
          // Also check for cite elements which often contain domains
          const citeElements = document.querySelectorAll('cite');
          citeElements.forEach(cite => {
            const text = cite.textContent;
            if (text) {
              // Extract domain from cite text and construct full URL
              const match = text.match(/^(?:https?:\/\/)?(?:www\.)?([^\/\s]+)/);
              if (match && match[1]) {
                let hostname = match[1];
                // Check if the original text starts with http/https
                const hasProtocol = text.startsWith('http://') || text.startsWith('https://');
                const protocol = hasProtocol ? (text.startsWith('https://') ? 'https://' : 'http://') : 'https://';
                
                if (!hostname.includes('google.') && hostname.length > 0) {
                  const fullDomain = `${protocol}${hostname}/`;
                  domains.add(fullDomain);
                }
              }
            }
          });
          
          resolve();
        }, 1000);
      });
    };
    
    // For synchronous execution, we'll do a quick extraction
    const selectors = [
      'div#search a[href]',
      'div[data-ved] a[href]',
      'h3 a[href]',
      '.g a[href]',
      'a[href*="http"]'
    ];
    
    let allLinks = [];
    selectors.forEach(selector => {
      const links = document.querySelectorAll(selector);
      allLinks = allLinks.concat(Array.from(links));
    });
    
    // Remove duplicates
    const uniqueLinks = [...new Set(allLinks)];
    
    uniqueLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (href && href.startsWith('http')) {
        try {
          const url = new URL(href);
          // Get the full domain URL (protocol + hostname)
          let fullDomain = `${url.protocol}//${url.hostname}/`;
          // Only add if it's not a Google domain
          if (!url.hostname.includes('google.') && url.hostname.length > 0) {
            domains.add(fullDomain);
          }
        } catch (e) {
          // Invalid URL, skip
        }
      }
    });
    
    // Also check for cite elements which often contain domains
    const citeElements = document.querySelectorAll('cite');
    citeElements.forEach(cite => {
      const text = cite.textContent;
      if (text) {
        // Extract domain from cite text and construct full URL
        const match = text.match(/^(?:https?:\/\/)?(?:www\.)?([^\/\s]+)/);
        if (match && match[1]) {
          let hostname = match[1];
          // Check if the original text starts with http/https
          const hasProtocol = text.startsWith('http://') || text.startsWith('https://');
          const protocol = hasProtocol ? (text.startsWith('https://') ? 'https://' : 'http://') : 'https://';
          
          if (!hostname.includes('google.') && hostname.length > 0) {
            const fullDomain = `${protocol}${hostname}/`;
            domains.add(fullDomain);
          }
        }
      }
    });
    
    return Array.from(domains);
  }