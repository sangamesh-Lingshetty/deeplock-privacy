// ================================
// DEEPLOCK PAUSE v2.2
// Exits cleanly when the session ends instead of redirecting into a dead blocker.
// ================================

const CIRCUMFERENCE = 283;
const PAUSE_SECONDS = 10;

const countdownEl = document.getElementById("countdown");
const ringEl = document.getElementById("ringProg");
const intentEl = document.getElementById("intentText");
const focusRemainingEl = document.getElementById("focusRemaining");

let countdownInterval = null;
let focusInterval = null;
let currentLockState = false;
let currentLockEndTime = 0;
let seconds = PAUSE_SECONDS;
let isExitingPause = false;

function stopPauseTimers() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  if (focusInterval) {
    clearInterval(focusInterval);
    focusInterval = null;
  }
}

function exitPausePage() {
  if (isExitingPause) return;
  isExitingPause = true;
  stopPauseTimers();
  window.location.replace(chrome.runtime.getURL("dashboard.html#overview"));
}

function updateFocusTimer() {
  if (!focusRemainingEl) return;

  if (!currentLockState || !currentLockEndTime) {
    exitPausePage();
    return;
  }

  const remaining = Math.max(0, currentLockEndTime - Date.now());
  if (remaining <= 0) {
    exitPausePage();
    return;
  }

  const m = Math.floor(remaining / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  focusRemainingEl.textContent = `${m}:${s.toString().padStart(2, "0")}`;
}

function tickCountdown() {
  if (!currentLockState || !currentLockEndTime || currentLockEndTime <= Date.now()) {
    exitPausePage();
    return;
  }

  seconds -= 1;
  if (countdownEl) countdownEl.textContent = Math.max(0, seconds);
  if (ringEl) {
    ringEl.style.strokeDashoffset = CIRCUMFERENCE * (Math.max(0, seconds) / PAUSE_SECONDS);
  }

  if (seconds <= 0) {
    stopPauseTimers();
    window.location.replace(chrome.runtime.getURL("blocked.html"));
  }
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;

  if (changes.isLocked) {
    currentLockState = !!changes.isLocked.newValue;
    if (!currentLockState) exitPausePage();
  }

  if (changes.lockEndTime) {
    currentLockEndTime = changes.lockEndTime.newValue || 0;
    if (!currentLockEndTime) exitPausePage();
  }

  if (changes.focusIntent && intentEl) {
    intentEl.textContent = changes.focusIntent.newValue || "Deep work";
  }
});

chrome.storage.local.get(["focusIntent", "lockEndTime", "isLocked"], (data) => {
  currentLockState = !!data.isLocked;
  currentLockEndTime = data.lockEndTime || 0;

  if (intentEl) {
    intentEl.textContent = data.focusIntent || "Deep work";
  }

  if (!currentLockState || !currentLockEndTime || currentLockEndTime <= Date.now()) {
    exitPausePage();
    return;
  }

  updateFocusTimer();
  focusInterval = setInterval(updateFocusTimer, 1000);
  countdownInterval = setInterval(tickCountdown, 1000);
});

try {
  chrome.runtime.sendMessage({ action: "incrementBlocked" }, () => {
    void chrome.runtime.lastError;
  });
} catch (_) {
  // ignore
}
