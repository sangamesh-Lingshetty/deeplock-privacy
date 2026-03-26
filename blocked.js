// ================================
// DEEPLOCK BLOCKED v3.2
// Shows current lock state and exits cleanly when the session ends
// ================================

const intentEl = document.getElementById("intentText");
const timerEl = document.getElementById("timerVal");
const siteCountEl = document.getElementById("siteCount");
const siteListEl = document.getElementById("siteNameList");
const urgeCounterText = document.getElementById("urgeCounterText");

let timerInterval = null;
let currentLockState = false;
let currentLockEndTime = 0;

function updateUrgeCounter() {
  chrome.storage.local.get(["todayBlockedAttempts"], (data) => {
    const resisted = data.todayBlockedAttempts || 0;
    if (urgeCounterText) {
      urgeCounterText.textContent = `You've resisted ${resisted} distraction${resisted === 1 ? "" : "s"} today`;
    }
  });
}

function exitBlockedPage() {
  clearInterval(timerInterval);
  if (timerEl) {
    timerEl.textContent = "SESSION ENDED";
    timerEl.classList.add("done");
  }

  setTimeout(() => {
    try {
      history.back();
    } catch (_) {
      window.close();
    }
  }, 900);
}

function getSiteName(entry) {
  try {
    if (entry && typeof entry === "object") {
      return entry.name || null;
    }

    if (typeof entry !== "string") return null;

    const filterMatch = entry.match(/\|\|([^|^/\s]+)\^/);
    if (filterMatch) return filterMatch[1];

    const globMatch = entry.match(/\*:\/\/(?:www\.)?([^/*]+)/);
    if (globMatch) return globMatch[1].replace(/^\*\./, "");

    return null;
  } catch (_) {
    return null;
  }
}

updateUrgeCounter();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;

  if (changes.todayBlockedAttempts) {
    updateUrgeCounter();
  }

  if (changes.isLocked) {
    currentLockState = !!changes.isLocked.newValue;
    if (!currentLockState) {
      exitBlockedPage();
      return;
    }
  }

  if (changes.lockEndTime) {
    currentLockEndTime = changes.lockEndTime.newValue || 0;
    if (!currentLockEndTime) {
      exitBlockedPage();
    }
  }
});

chrome.storage.local.get(
  ["focusIntent", "lockEndTime", "blockedDomains", "isLocked"],
  (data) => {
    currentLockState = !!data.isLocked;
    currentLockEndTime = data.lockEndTime || 0;

    if (intentEl) {
      intentEl.textContent = data.focusIntent || "Deep work";
    }

    const domains = data.blockedDomains || [];
    const uniqueNames = [...new Set(domains.map((item) => getSiteName(item)).filter(Boolean))];

    if (siteCountEl) {
      siteCountEl.textContent = uniqueNames.length;
    }

    if (siteListEl) {
      siteListEl.innerHTML = uniqueNames
        .map((name) => `<span class="site-tag">${name}</span>`)
        .join("");
    }

    function updateTimer() {
      if (!timerEl) return;

      if (!currentLockState || !currentLockEndTime) {
        exitBlockedPage();
        return;
      }

      const remaining = Math.max(0, currentLockEndTime - Date.now());
      if (remaining <= 0) {
        exitBlockedPage();
        return;
      }

      const h = Math.floor(remaining / 3600000);
      const m = Math.floor((remaining % 3600000) / 60000);
      const s = Math.floor((remaining % 60000) / 1000);

      timerEl.textContent =
        h > 0
          ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
          : `${m}:${s.toString().padStart(2, "0")}`;
    }

    updateTimer();
    timerInterval = setInterval(updateTimer, 1000);
  },
);
