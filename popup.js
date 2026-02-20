let selectedMinutes = null;
let timerInterval = null;

// Handle time button selection
document.querySelectorAll('.time-btn').forEach(button => {
  button.addEventListener('click', () => {
    // Clear previous selection
    document.querySelectorAll('.time-btn').forEach(b =>
      b.classList.remove('selected')
    );

    // Select current
    button.classList.add('selected');

    selectedMinutes = parseInt(button.dataset.min, 10);

    // Enable start button
    const startBtn = document.getElementById('start');
    startBtn.disabled = false;
    startBtn.textContent = `Lock for ${selectedMinutes} min`;
  });
});

// Start focus session
document.getElementById('start').addEventListener('click', () => {
  if (!selectedMinutes) return;

  const intentInput = document.getElementById('focusIntent');
  const intent = intentInput ? intentInput.value.trim() : '';

  if (!intent) {
    alert('Please enter what you are committing to.');
    return;
  }

  const endTime = Date.now() + selectedMinutes * 60 * 1000;

  // Save lock state + intent
  chrome.storage.local.set(
    {
      isLocked: true,
      lockEndTime: endTime,
      focusIntent: intent,
      lastFocusTime: Date.now()
    },
    () => {
      // Tell background to start blocking
      chrome.runtime.sendMessage({ action: 'startBlock', lockEndTime: endTime });

      // Show timer UI
      showTimer(endTime);
    }
  );
});

// Show active timer view
function showTimer(endTime) {
  document.getElementById('inactive').style.display = 'none';
  document.getElementById('active').style.display = 'block';

  updateTimer(endTime);

  if (timerInterval) clearInterval(timerInterval);

  timerInterval = setInterval(() => {
    updateTimer(endTime);
  }, 1000);

  chrome.storage.local.get(['blockedDomains'], (data) => {
    const domains = data.blockedDomains || [];

    const names = [...new Set(
      domains.map((d) => {
        const match = d.match(/\*:\/\/(?:www\.)?([^/]+)/);
        return match ? match[1].replace(/\.\*$/, '').split('.')[0] : null;
      }).filter(Boolean).map((n) => n.charAt(0).toUpperCase() + n.slice(1))
    )];

    const count = names.length;
    document.getElementById('blockedCount').textContent =
      `\u{1F512} ${count} site${count !== 1 ? 's' : ''} blocked`;

    if (names.length > 5) {
      const shown = names.slice(0, 4).join(', ');
      document.getElementById('blockedList').textContent =
        `${shown} ...and more`;
    } else {
      document.getElementById('blockedList').textContent = names.join(', ');
    }
  });
}

// Update timer text
function updateTimer(endTime) {
  const remaining = Math.max(0, endTime - Date.now());
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);

  document.getElementById('timer').textContent =
    `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Restore active session on popup reopen
chrome.storage.local.get(
  ['isLocked', 'lockEndTime'],
  (data) => {
    if (data.isLocked && data.lockEndTime && data.lockEndTime > Date.now()) {
      showTimer(data.lockEndTime);
    }
  }
);

const FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSdsXiTtGinkMXWV7zR0WhhoppxPLNXj4rPexSTY_2yYslNrUw/viewform';

// Upgrade
document.getElementById('upgradeBtn').addEventListener('click', () => {
  chrome.tabs.create({ url: FORM_URL });
});

// Feedback
document.getElementById('feedbackBtn').addEventListener('click', () => {
  chrome.tabs.create({ url: FORM_URL });
});

// Load focus stats
chrome.storage.local.get(
  ['totalSessions', 'totalFocusMinutes'],
  (data) => {
    const sessions = data.totalSessions || 0;
    const totalMin = data.totalFocusMinutes || 0;

    document.getElementById('sessionCount').textContent =
      `Sessions completed: ${sessions}`;

    if (totalMin >= 60) {
      const hrs = Math.floor(totalMin / 60);
      const mins = totalMin % 60;
      const timeStr = mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
      document.getElementById('focusTime').textContent =
        `Total focus time: ${timeStr}`;
    } else {
      document.getElementById('focusTime').textContent =
        `Total focus time: ${totalMin} minutes`;
    }
  }
);
