// ================================
// DEEPLOCK BLOCKED v3.1
// Handles both {name,filter} objects and legacy string formats
// ================================

const intentEl = document.getElementById("intentText");
const timerEl = document.getElementById("timerVal");
const siteCountEl = document.getElementById("siteCount");
const siteListEl = document.getElementById("siteNameList");

let timerInterval = null;

chrome.storage.local.get(
  ["focusIntent", "lockEndTime", "blockedDomains"],
  (data) => {
    // 1. Focus intent
    if (intentEl) intentEl.textContent = data.focusIntent || "Deep work";

    // 2. Site names — handles any format safely
    const domains = data.blockedDomains || [];
    const siteNames = domains.map((d) => getSiteName(d)).filter(Boolean);

    // Deduplicate
    const unique = [...new Set(siteNames)];

    if (siteCountEl) siteCountEl.textContent = unique.length;
    if (siteListEl) {
      siteListEl.innerHTML = unique
        .map((name) => `<span class="site-tag">${name}</span>`)
        .join("");
    }

    // 3. Timer — lockEndTime guaranteed valid now
    const lockEndTime = data.lockEndTime || 0;

    function updateTimer() {
      const remaining = Math.max(0, lockEndTime - Date.now());
      if (!timerEl) return;

      if (remaining <= 0) {
        clearInterval(timerInterval);
        timerEl.textContent = "DONE ✓";
        timerEl.classList.add("done");
        setTimeout(() => {
          try {
            history.back();
          } catch (e) {
            window.close();
          }
        }, 2000);
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

// Safely extract a display name from any domain format
function getSiteName(d) {
  try {
    // New format: {name: "Instagram", filter: "||instagram.com^"}
    if (d && typeof d === "object") {
      return d.name || null;
    }

    if (typeof d !== "string") return null;

    // New filter format: ||domain.com^
    const m1 = d.match(/\|\|([^|^/\s]+)\^/);
    if (m1) return m1[1];

    // Old glob format: *://www.domain.com/*
    const m2 = d.match(/\*:\/\/(?:www\.)?([^/*]+)/);
    if (m2) return m2[1].replace(/^\*\./, "");

    return null;
  } catch (e) {
    return null; // never crash — just skip the entry
  }
}
