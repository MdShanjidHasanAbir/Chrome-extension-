/**
 * Content script for analyzing Facebook pages
 * COMPLETELY REWRITTEN - Fixed delete button detection
 */

// Listen for messages from the extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkPostStatus') {
    const status = analyzePageForPost();
    sendResponse({ status: status });
  } else if (request.action === 'countPosts') {
    const count = countPostsOnPage();
    sendResponse({ count: count });
  } else if (request.action === 'deletePendingPost') {
    deletePendingPost().then(result => {
      sendResponse(result);
    });
    return true;
  }
  return true;
});

/**
 * COMPLETELY REWRITTEN: Deletes a pending post
 */
async function deletePendingPost() {
  try {
    console.log('🗑️ Starting delete process...');
    
    await sleep(2000);
    
    // Step 1: Find the post and its action buttons
    const deleteButton = await findAndClickDeleteButton();
    
    if (!deleteButton.success) {
      console.error('❌ Failed to find/click delete button:', deleteButton.message);
      return deleteButton;
    }
    
    console.log('✅ First delete button clicked, waiting for popup...');
    await sleep(2000);
    
    // Step 2: Click confirmation button in popup
    const confirmResult = await findAndClickConfirmButton();
    
    if (!confirmResult.success) {
      console.error('❌ Failed to find/click confirm button:', confirmResult.message);
      return confirmResult;
    }
    
    console.log('✅ Confirmation button clicked');
    await sleep(2000);
    
    return { success: true, message: 'Post deleted successfully' };
    
  } catch (error) {
    console.error('❌ Exception in deletePendingPost:', error);
    return { success: false, message: 'Exception: ' + error.message };
  }
}

/**
 * NEW: Find and click the delete button on the post
 */
async function findAndClickDeleteButton() {
  console.log('🔍 Searching for delete button on post...');
  
  // Strategy 1: Find all posts and look for delete button
  const posts = document.querySelectorAll('[role="article"], [data-pagelet*="FeedUnit"]');
  
  for (const post of posts) {
    // Find the three-dot menu button first
    const menuButtons = post.querySelectorAll('[aria-label*="Action"], [aria-label*="menu"], [aria-label*="More"]');
    
    for (const menuBtn of menuButtons) {
      if (menuBtn.offsetParent !== null) {
        console.log('📍 Found menu button, clicking...');
        
        // Click menu button
        menuBtn.click();
        await sleep(1000);
        
        // Now look for delete button in the dropdown
        const deleteBtn = await findDeleteInDropdown();
        
        if (deleteBtn) {
          deleteBtn.click();
          return { success: true, message: 'Delete button clicked' };
        }
      }
    }
  }
  
  // Strategy 2: Look for visible delete button (might already be shown)
  const visibleDeleteButtons = Array.from(document.querySelectorAll('[aria-label="Delete"][role="button"]'))
    .filter(btn => {
      const isVisible = btn.offsetParent !== null && btn.getBoundingClientRect().width > 0;
      const notDisabled = btn.getAttribute('aria-disabled') !== 'true';
      const notHidden = btn.getAttribute('aria-hidden') !== 'true';
      const notInDialog = !btn.closest('[role="dialog"]');
      
      return isVisible && notDisabled && notHidden && notInDialog;
    });
  
  if (visibleDeleteButtons.length > 0) {
    console.log('📍 Found visible delete button');
    visibleDeleteButtons[0].click();
    return { success: true, message: 'Delete button clicked' };
  }
  
  // Strategy 3: Find enabled delete button specifically
  const allDeleteButtons = document.querySelectorAll('div[aria-label="Delete"]');
  
  for (const btn of allDeleteButtons) {
    const isDisabled = btn.getAttribute('aria-disabled') === 'true';
    const isHidden = btn.getAttribute('aria-hidden') === 'true';
    const hasDisabledClass = btn.classList.contains('x1h6gzvc');
    const isInDialog = btn.closest('[role="dialog"], [role="alertdialog"]');
    const role = btn.getAttribute('role');
    
    if (!isDisabled && !isHidden && !hasDisabledClass && !isInDialog && role === 'button') {
      console.log('📍 Found enabled delete button (Strategy 3)');
      btn.click();
      return { success: true, message: 'Delete button clicked' };
    }
  }
  
  return { success: false, message: 'No delete button found on page' };
}

/**
 * NEW: Find delete button in dropdown menu
 */
async function findDeleteInDropdown() {
  await sleep(500);
  
  // Look for delete button in any visible dropdown/menu
  const dropdowns = document.querySelectorAll('[role="menu"], [role="listbox"]');
  
  for (const dropdown of dropdowns) {
    if (dropdown.offsetParent !== null) {
      const deleteItems = dropdown.querySelectorAll('[role="menuitem"], [role="option"]');
      
      for (const item of deleteItems) {
        const text = item.textContent.trim();
        const ariaLabel = item.getAttribute('aria-label');
        
        if (text === 'Delete' || ariaLabel === 'Delete') {
          console.log('📍 Found Delete in dropdown menu');
          return item;
        }
      }
    }
  }
  
  // Also check for direct delete buttons that appeared after menu click
  const deleteButtons = Array.from(document.querySelectorAll('[aria-label="Delete"][role="button"]'))
    .filter(btn => {
      const isVisible = btn.offsetParent !== null;
      const notDisabled = btn.getAttribute('aria-disabled') !== 'true';
      const notInDialog = !btn.closest('[role="dialog"]');
      return isVisible && notDisabled && notInDialog;
    });
  
  return deleteButtons[0] || null;
}

/**
 * NEW: Find and click confirmation button in delete dialog
 */
async function findAndClickConfirmButton() {
  console.log('🔍 Searching for confirmation dialog...');
  
  // Wait a bit for dialog to appear
  await sleep(1000);
  
  // Find the delete confirmation dialog
  const dialogs = document.querySelectorAll('[role="dialog"], [role="alertdialog"]');
  
  for (const dialog of dialogs) {
    if (dialog.offsetParent === null) continue;
    
    const dialogText = dialog.textContent;
    const isDeleteDialog = dialogText.includes('Delete post') || 
                          dialogText.includes('Are you sure') ||
                          dialogText.includes('delete this post');
    
    if (isDeleteDialog) {
      console.log('📍 Found delete confirmation dialog');
      
      // Find delete button in this dialog
      const deleteButtons = dialog.querySelectorAll('[aria-label="Delete"][role="button"], [role="button"]');
      
      for (const btn of deleteButtons) {
        const btnText = btn.textContent.trim();
        const ariaLabel = btn.getAttribute('aria-label');
        
        // Make sure it's Delete, not Cancel
        if ((btnText === 'Delete' || ariaLabel === 'Delete') && !btnText.includes('Cancel')) {
          console.log('📍 Found Delete button in dialog');
          btn.click();
          return { success: true, message: 'Confirmation button clicked' };
        }
      }
      
      // Alternative: Find by span text
      const spans = dialog.querySelectorAll('span');
      for (const span of spans) {
        if (span.textContent.trim() === 'Delete') {
          const button = span.closest('[role="button"]');
          if (button && !button.textContent.includes('Cancel')) {
            console.log('📍 Found Delete button via span');
            button.click();
            return { success: true, message: 'Confirmation button clicked' };
          }
        }
      }
    }
  }
  
  return { success: false, message: 'Confirmation dialog or button not found' };
}

/**
 * Helper: Sleep function
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Analyzes the current Facebook page
 */
function analyzePageForPost() {
  const result = {
    hasPost: false,
    postCount: 0,
    pageType: detectPageType()
  };
  
  const postCount = countPostsOnPage();
  result.postCount = postCount;
  result.hasPost = postCount > 0;
  
  return result;
}

/**
 * Counts posts on the page
 */
function countPostsOnPage() {
  const noPostsIndicators = [
    'No posts to show',
    'No content available',
    'Nothing to show here',
    'No pending posts',
    'No published posts',
    'No declined posts',
    'Be the first to post',
    'You don\'t have any posts',
    'There are no posts'
  ];
  
  const bodyText = document.body.innerText || '';
  const hasNoPostsMessage = noPostsIndicators.some(msg => 
    bodyText.toLowerCase().includes(msg.toLowerCase())
  );
  
  if (hasNoPostsMessage) {
    return 0;
  }
  
  let maxCount = 0;
  
  const articles = document.querySelectorAll('[role="article"]');
  const validArticles = Array.from(articles).filter(article => {
    const text = article.innerText || '';
    return text.length > 30 && !text.toLowerCase().includes('write something');
  });
  maxCount = Math.max(maxCount, validArticles.length);
  
  const feedUnits = document.querySelectorAll('[data-pagelet*="FeedUnit"]');
  maxCount = Math.max(maxCount, feedUnits.length);
  
  const postContainers = document.querySelectorAll('.x1yztbdb.x1n2onr6.xh8yej3');
  const validContainers = Array.from(postContainers).filter(container => {
    const hasContent = container.querySelector('img, video, [role="button"]');
    return hasContent !== null;
  });
  maxCount = Math.max(maxCount, validContainers.length);
  
  return maxCount;
}

/**
 * Detects page type
 */
function detectPageType() {
  const url = window.location.href;
  
  if (url.includes('my_pending_content')) return 'pending';
  if (url.includes('my_published_content')) return 'published';
  if (url.includes('my_declined_content')) return 'declined';
  if (url.includes('removed_content')) return 'removed';
  
  const pageTitle = document.title.toLowerCase();
  if (pageTitle.includes('pending')) return 'pending';
  if (pageTitle.includes('published')) return 'published';
  if (pageTitle.includes('declined')) return 'declined';
  
  return 'unknown';
}

console.log('✅ Facebook Post Status Checker content script loaded (v1.3 - Fixed Delete)');