let keywords = [];
let isRunning = false;

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  await loadKeywords();
  await checkAutomationStatus();
  
  // Event listeners
  document.getElementById('addBtn').addEventListener('click', addKeyword);
  document.getElementById('keywordInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addKeyword();
  });
  document.getElementById('toggleBtn').addEventListener('click', toggleAutomation);
});

async function loadKeywords() {
  const data = await chrome.storage.local.get(['keywords']);
  keywords = data.keywords || [];
  renderKeywords();
}

async function checkAutomationStatus() {
  const data = await chrome.storage.local.get(['isRunning']);
  isRunning = data.isRunning || false;
  updateUI();
}

function renderKeywords() {
  const listContainer = document.getElementById('keywordsList');
  const countElement = document.getElementById('keywordCount');
  
  listContainer.innerHTML = '';
  countElement.textContent = keywords.length;
  
  keywords.forEach((keyword, index) => {
    const keywordElement = document.createElement('div');
    keywordElement.className = 'keyword-item';
    
    keywordElement.innerHTML = `
      <span class="keyword-text">${keyword}</span>
      <div class="keyword-actions">
        <button class="edit-btn" data-index="${index}">Edit</button>
        <button class="delete-btn" data-index="${index}">Delete</button>
      </div>
    `;
    
    listContainer.appendChild(keywordElement);
  });
  
  // Add event listeners to buttons
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.dataset.index);
      deleteKeyword(index);
    });
  });
  
  document.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.dataset.index);
      editKeyword(index);
    });
  });
}

async function addKeyword() {
  const input = document.getElementById('keywordInput');
  const keyword = input.value.trim();
  
  if (keyword && !keywords.includes(keyword)) {
    keywords.push(keyword);
    await chrome.storage.local.set({ keywords });
    input.value = '';
    renderKeywords();
  }
}

async function deleteKeyword(index) {
  keywords.splice(index, 1);
  await chrome.storage.local.set({ keywords });
  renderKeywords();
}

async function editKeyword(index) {
  const newKeyword = prompt('Edit keyword:', keywords[index]);
  if (newKeyword && newKeyword.trim()) {
    keywords[index] = newKeyword.trim();
    await chrome.storage.local.set({ keywords });
    renderKeywords();
  }
}

async function toggleAutomation() {
  if (keywords.length === 0) {
    alert('Please add at least one keyword before starting automation.');
    return;
  }
  
  if (isRunning) {
    // Stop automation
    chrome.runtime.sendMessage({ action: 'stopAutomation' });
    isRunning = false;
  } else {
    // Start automation
    chrome.runtime.sendMessage({ action: 'startAutomation' });
    isRunning = true;
  }
  
  updateUI();
}

function updateUI() {
  const statusText = document.getElementById('status-text');
  const toggleBtn = document.getElementById('toggleBtn');
  
  if (isRunning) {
    statusText.textContent = 'Running';
    statusText.style.color = '#4CAF50';
    toggleBtn.textContent = 'Stop';
    toggleBtn.classList.add('stop');
  } else {
    statusText.textContent = 'Stopped';
    statusText.style.color = '#f44336';
    toggleBtn.textContent = 'Start';
    toggleBtn.classList.remove('stop');
  }
}