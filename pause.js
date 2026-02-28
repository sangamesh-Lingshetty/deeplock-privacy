// ================================
// DEEPLOCK PAUSE v2.1
// FIX: all timers start INSIDE storage callback
// so lockEndTime is always valid before use
// ================================

const CIRCUMFERENCE = 283; // 2π × 45

// ── Elements ─────────────────────────────────
const countdownEl = document.getElementById("countdown");
const ringEl = document.getElementById("ringProg");
const intentEl = document.getElementById("intentText");
const focusRemainingEl = document.getElementById("focusRemaining");

// ── Load storage FIRST, then start everything ─
chrome.storage.local.get(["focusIntent", "lockEndTime"], (data) => {
  // 1. Show intent immediately
  if (intentEl) {
    intentEl.textContent = data.focusIntent || "Deep work";
  }

  // 2. lockEndTime is now guaranteed valid
  const lockEndTime = data.lockEndTime || 0;

  // 3. Focus timer — reads lockEndTime from closure (always valid)
  function updateFocusTimer() {
    const remaining = Math.max(0, lockEndTime - Date.now());
    const m = Math.floor(remaining / 60000);
    const s = Math.floor((remaining % 60000) / 1000);
    if (focusRemainingEl) {
      focusRemainingEl.textContent = `${m}:${s.toString().padStart(2, "0")}`;
    }
  }
  updateFocusTimer();
  const focusInterval = setInterval(updateFocusTimer, 1000);

  // 4. Countdown ring (10 → 0, then redirect)
  let seconds = 10;

  function tick() {
    seconds--;

    if (countdownEl) countdownEl.textContent = seconds;
    if (ringEl) {
      ringEl.style.strokeDashoffset = CIRCUMFERENCE * (seconds / 10);
    }

    if (seconds <= 0) {
      clearInterval(countdownInterval);
      clearInterval(focusInterval);
      // Navigate to blocked page
      window.location.replace(chrome.runtime.getURL("blocked.html"));
    }
  }

  const countdownInterval = setInterval(tick, 1000);
});

// ── Tell background to count this attempt ────
// Wrapped in try/catch — safe even if SW not ready
try {
  chrome.runtime.sendMessage({ action: "incrementBlocked" }, () => {
    void chrome.runtime.lastError; // suppress unchecked error warning
  });
} catch (e) {
  /* ignore */
}
