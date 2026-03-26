const timerEl = document.getElementById("hardModeTimer");

chrome.storage.local.get(["lockEndTime"], (data) => {
  const endTime = data.lockEndTime || 0;

  function tick() {
    const remaining = Math.max(0, endTime - Date.now());
    const hours = Math.floor(remaining / 3600000);
    const mins = Math.floor((remaining % 3600000) / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    if (!timerEl) return;

    timerEl.textContent =
      hours > 0
        ? `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
        : `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  tick();
  setInterval(tick, 1000);
});
