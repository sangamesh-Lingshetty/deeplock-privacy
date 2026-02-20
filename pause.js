let seconds = 10;

// Show intent
chrome.storage.local.get(["focusIntent"], (data) => {
  const el = document.getElementById("intentText");
  if (el && data.focusIntent) {
    el.textContent = data.focusIntent;
  }
});

// Countdown logic
const countdownEl = document.getElementById("countdown");

const interval = setInterval(() => {
  seconds--;
  countdownEl.textContent = seconds;

  if (seconds <= 0) {
    clearInterval(interval);
    window.location.href = chrome.runtime.getURL("blocked.html");
  }
}, 1000);
