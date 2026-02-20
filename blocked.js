// Load focus intent once
chrome.storage.local.get(["focusIntent"], (data) => {
  const el = document.getElementById("intentText");
  if (el && data.focusIntent) {
    el.textContent = data.focusIntent;
  }
});

let timerInterval = null;

function updateTimer() {
  chrome.storage.local.get(["lockEndTime"], (data) => {
    const timerEl = document.getElementById("timer");

    if (!data.lockEndTime) {
      timerEl.textContent = "Session Ended";
      clearInterval(timerInterval);
      setTimeout(() => location.reload(), 1000);
      return;
    }

    const remaining = data.lockEndTime - Date.now();

    if (remaining <= 0) {
      timerEl.textContent = "Session Ended";
      clearInterval(timerInterval);
      setTimeout(() => location.reload(), 1000);
      return;
    }

    const hours = Math.floor(remaining / 3600000);
    const mins = Math.floor((remaining % 3600000) / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);

    if (hours > 0) {
      timerEl.textContent = `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    } else {
      timerEl.textContent = `${mins}:${secs.toString().padStart(2, "0")}`;
    }
  });
}

// Update immediately
updateTimer();

// Update every second
timerInterval = setInterval(updateTimer, 1000);
