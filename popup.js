// ================================
// DEEPLOCK POPUP v3.0
// Lemon Squeezy License Key Auth
// ================================

let selectedMinutes = null;
let timerInterval = null;
let isPro = false;
let sessionDurationTotal = 0;

const FEEDBACK_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSdsXiTtGinkMXWV7zR0WhhoppxPLNXj4rPexSTY_2yYslNrUw/viewform";

const POPUP_POPULAR_SITES = [
  { name: "LinkedIn", filter: "||linkedin.com^" },
  { name: "Snapchat", filter: "||snapchat.com^" },
  { name: "Pinterest", filter: "||pinterest.com^" },
  { name: "Amazon", filter: "||amazon.com^" },
  { name: "Flipkart", filter: "||flipkart.com^" },
  { name: "WhatsApp Web", filter: "||web.whatsapp.com^" },
  { name: "Telegram", filter: "||web.telegram.org^" },
  { name: "Spotify", filter: "||spotify.com^" },
  { name: "Hacker News", filter: "||news.ycombinator.com^" },
  { name: "9GAG", filter: "||9gag.com^" },
];

// ================================
// INIT
// ================================
(function init() {
  checkProStatus();
  loadStats();
  restoreSessionIfActive();
  loadSessionLimit();
  loadBlockedSiteCount(); // dynamic count
  bindEvents();
})();

// ================================
// CHECK PRO STATUS
// Always hits Lemon Squeezy server — server result overwrites local storage
// Local is just a loading fallback, not the truth
// ================================
function checkProStatus() {
  // Show cached state immediately (no flicker)
  chrome.storage.local.get(["isPro"], (data) => {
    isPro = !!data.isPro;
    updateProUI();
  });

  // Then validate against server — result overwrites the cached state
  chrome.runtime.sendMessage({ action: "validateLicense" }, (res) => {
    if (chrome.runtime.lastError) return; // background not ready yet
    const serverIsPro = res?.isPro ?? false;
    if (serverIsPro !== isPro) {
      isPro = serverIsPro;
      updateProUI();
    }
  });
}

function updateProUI() {
  const badge = document.getElementById("probadge");
  const freeProSection = document.getElementById("freeProSection");
  const customSitesSection = document.getElementById("customSitesSection");

  if (isPro) {
    if (badge) badge.style.display = "flex";
    if (freeProSection) freeProSection.style.display = "none";
    if (customSitesSection) customSitesSection.style.display = "block";

    // Show dashboard button, hide feedback
    const dashBtn = document.getElementById("dashboardLink");
    const feedBtn = document.getElementById("supportBtn");
    if (dashBtn) dashBtn.style.display = "block";
    if (feedBtn) feedBtn.style.display = "none";

    // Remove pro-gate locks from time buttons
    document.querySelectorAll(".time-btn.pro-gate").forEach((btn) => {
      btn.classList.remove("pro-gate");
      const lock = btn.querySelector(".pro-lock");
      if (lock) lock.remove();
    });

    loadCustomSites();
    renderSiteSuggestions();
  } else {
    if (badge) badge.style.display = "none";
    if (freeProSection) freeProSection.style.display = "block";
    if (customSitesSection) customSitesSection.style.display = "none";

    const dashBtn = document.getElementById("dashboardLink");
    const feedBtn = document.getElementById("supportBtn");
    if (dashBtn) dashBtn.style.display = "none";
    if (feedBtn) feedBtn.style.display = "block";
  }
}

// ================================
// BIND ALL EVENTS
// ================================
function bindEvents() {
  document.querySelectorAll(".time-btn").forEach((btn) => {
    btn.addEventListener("click", () => handleTimeSelect(btn));
  });

  const btn120 = document.getElementById("btn120");
  if (btn120) {
    btn120.addEventListener("click", () => {
      if (!isPro) {
        showUpgradeModal("feature");
        return;
      }
      handleTimeSelect(btn120);
    });
  }

  const btnCustom = document.getElementById("btnCustom");
  if (btnCustom) {
    btnCustom.addEventListener("click", () => {
      if (!isPro) {
        showUpgradeModal("feature");
        return;
      }
      const row = document.getElementById("customTimeRow");
      if (row)
        row.style.display = row.style.display === "none" ? "block" : "none";
    });
  }

  const customInput = document.getElementById("customMinInput");
  if (customInput) {
    customInput.addEventListener("input", (e) => {
      const val = parseInt(e.target.value);
      if (val > 0 && val <= 480) {
        selectedMinutes = val;
        updateStartBtn();
      }
    });
  }

  const startBtn = document.getElementById("startBtn");
  if (startBtn) startBtn.addEventListener("click", startSession);

  const dashBtn = document.getElementById("dashboardBtn");
  if (dashBtn) dashBtn.addEventListener("click", openDashboard);
  const dashLink = document.getElementById("dashboardLink");
  if (dashLink) dashLink.addEventListener("click", openDashboard);

  const upgradeBtn = document.getElementById("upgradeBtn");
  if (upgradeBtn) upgradeBtn.addEventListener("click", triggerUpgrade);
  const modalUpgradeBtn = document.getElementById("modalUpgradeBtn");
  if (modalUpgradeBtn)
    modalUpgradeBtn.addEventListener("click", triggerUpgrade);
  const modalCloseBtn = document.getElementById("modalCloseBtn");
  if (modalCloseBtn) {
    modalCloseBtn.addEventListener("click", () => {
      document.getElementById("upgradeModal").style.display = "none";
    });
  }

  // License key activation (replaces the old broken code system)
  const activateBtn = document.getElementById("activateBtn");
  if (activateBtn) activateBtn.addEventListener("click", activateLicenseKey);

  const licenseInput = document.getElementById("licenseKeyInput");
  if (licenseInput) {
    licenseInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") activateLicenseKey();
    });
  }

  const supportBtnEl = document.getElementById("supportBtn");
  if (supportBtnEl) {
    supportBtnEl.addEventListener("click", () => {
      window.open(
        "mailto:sangameshlingshetty@gmail.com?subject=DeepLock Support",
      );
    });
  }

  const addSiteBtn = document.getElementById("addSiteBtn");
  if (addSiteBtn)
    addSiteBtn.addEventListener("click", () => {
      const suggestions = document.getElementById("siteSuggestions");
      if (suggestions) {
        const isOpen = suggestions.style.display !== "none";
        suggestions.style.display = isOpen ? "none" : "block";
        if (!isOpen) document.getElementById("manualSitePopup")?.focus();
      }
    });

  const manualAddBtn = document.getElementById("manualSiteAdd");
  if (manualAddBtn) manualAddBtn.addEventListener("click", addManualSitePopup);

  const manualInput = document.getElementById("manualSitePopup");
  if (manualInput)
    manualInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") addManualSitePopup();
    });

  const signInBtn = document.getElementById("signInBtn");
  if (signInBtn) signInBtn.addEventListener("click", handleSignIn);

  const signOutBtn = document.getElementById("signOutBtn");
  if (signOutBtn) signOutBtn.addEventListener("click", handleSignOut);
}

// ================================
// TIME SELECTION
// ================================
function handleTimeSelect(btn) {
  if (btn.classList.contains("pro-gate")) {
    showUpgradeModal("feature");
    return;
  }
  document
    .querySelectorAll(".time-btn")
    .forEach((b) => b.classList.remove("selected"));
  btn.classList.add("selected");
  selectedMinutes = parseInt(btn.dataset.min, 10);
  updateStartBtn();
}

function updateStartBtn() {
  const btn = document.getElementById("startBtn");
  const label = document.getElementById("startLabel");
  if (!btn || !label) return;

  if (selectedMinutes) {
    btn.disabled = false;
    label.textContent = `Lock in for ${selectedMinutes} min →`;
  } else {
    btn.disabled = true;
    label.textContent = "Select a time to lock in";
  }
}

// ================================
// START SESSION
// ================================
function startSession() {
  if (!selectedMinutes) return;

  const intentInput = document.getElementById("focusIntent");
  const intent = intentInput ? intentInput.value.trim() : "";

  if (!intent) {
    if (intentInput) {
      intentInput.focus();
      intentInput.style.borderColor = "#ef4444";
      setTimeout(() => {
        intentInput.style.borderColor = "";
      }, 2000);
    }
    return;
  }

  const endTime = Date.now() + selectedMinutes * 60 * 1000;
  sessionDurationTotal = selectedMinutes;

  // Let background handle ALL storage — no race condition
  chrome.runtime.sendMessage(
    {
      action: "startBlock",
      lockEndTime: endTime,
      duration: selectedMinutes,
      intent,
    },
    (res) => {
      if (res?.status === "limit_reached") {
        showUpgradeModal("limit");
        return;
      }
      loadSessionLimit();
      showActiveState(endTime);
    },
  );
}

// ================================
// ACTIVE SESSION UI
// ================================
function showActiveState(endTime) {
  const inactive = document.getElementById("inactive");
  const active = document.getElementById("active");
  const proSection = document.getElementById("proSection");

  if (inactive) inactive.style.display = "none";
  if (proSection) proSection.style.display = "none";
  if (active) active.style.display = "block";

  chrome.storage.local.get(
    ["focusIntent", "sessionDuration", "blockedDomains"],
    (data) => {
      const intentEl = document.getElementById("sessionIntent");
      if (intentEl) intentEl.textContent = data.focusIntent || "";
      sessionDurationTotal = data.sessionDuration || selectedMinutes || 60;

      const blockCountEl = document.getElementById("sessionBlockCount");
      if (blockCountEl) {
        const domains = data.blockedDomains || [];
        const unique = new Set(
          domains
            .map((d) => {
              // New format: {name, filter} object
              if (typeof d === "object" && d.name) return d.name;
              // Old string format fallback
              if (typeof d !== "string") return null;
              const m = d.match(/\*:\/\/(?:www\.)?([^/]+)/);
              return m ? m[1].replace(/^\*\./, "") : null;
            })
            .filter(Boolean),
        );
        blockCountEl.textContent =
          unique.size > 0 ? unique.size : domains.length;
      }
    },
  );

  startTimerUI(endTime);
}

// ================================
// TIMER + RING
// ================================
function startTimerUI(endTime) {
  if (timerInterval) clearInterval(timerInterval);

  const ringEl = document.getElementById("ringProgress");
  const circumference = 326.7;

  function tick() {
    const remaining = Math.max(0, endTime - Date.now());
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);

    const timerEl = document.getElementById("timer");
    if (timerEl)
      timerEl.textContent = `${mins}:${secs.toString().padStart(2, "0")}`;

    if (ringEl) {
      const totalMs = sessionDurationTotal * 60 * 1000;
      const elapsed = totalMs - remaining;
      const pct = Math.min(1, elapsed / totalMs);
      ringEl.style.strokeDashoffset = circumference * (1 - pct);
    }

    if (remaining <= 0) clearInterval(timerInterval);
  }

  tick();
  timerInterval = setInterval(tick, 1000);
}

// ================================
// RESTORE SESSION IF ACTIVE
// ================================
function restoreSessionIfActive() {
  chrome.storage.local.get(
    ["isLocked", "lockEndTime", "sessionDuration"],
    (data) => {
      if (data.isLocked && data.lockEndTime && data.lockEndTime > Date.now()) {
        sessionDurationTotal = data.sessionDuration || 60;
        showActiveState(data.lockEndTime);
      }
    },
  );
}

// ================================
// LOAD STATS
// ================================
function loadStats() {
  chrome.storage.local.get(
    ["totalSessions", "totalFocusMinutes", "currentStreak"],
    (data) => {
      const sessions = data.totalSessions || 0;
      const mins = data.totalFocusMinutes || 0;
      const streak = data.currentStreak || 0;

      const sessEl = document.getElementById("stripSessions");
      if (sessEl) sessEl.textContent = sessions;

      const streakEl = document.getElementById("stripStreak");
      if (streakEl) streakEl.textContent = streak;

      const hoursEl = document.getElementById("stripHours");
      if (hoursEl) {
        if (mins >= 60) {
          const h = Math.floor(mins / 60);
          const m = mins % 60;
          hoursEl.textContent = m > 0 ? `${h}h${m}m` : `${h}h`;
        } else {
          hoursEl.textContent = `${mins}m`;
        }
      }
    },
  );
}

function renderSiteSuggestions() {
  const grid = document.getElementById("suggestionsGrid");
  if (!grid) return;

  chrome.storage.local.get(["customBlockedDomains"], (data) => {
    const existing = (data.customBlockedDomains || []).map((d) =>
      typeof d === "object" ? d.filter : d,
    );

    grid.innerHTML = POPUP_POPULAR_SITES.map((s) => {
      const added = existing.includes(s.filter);
      return `<button class="sugg-btn${added ? " sugg-added" : ""}"
        data-name="${s.name}" data-filter="${s.filter}" ${added ? "disabled" : ""}>
        ${added ? "✓" : "+"} ${s.name}
      </button>`;
    }).join("");

    grid.querySelectorAll(".sugg-btn:not([disabled])").forEach((btn) => {
      btn.addEventListener("click", () => {
        const site = { name: btn.dataset.name, filter: btn.dataset.filter };
        chrome.storage.local.get(["customBlockedDomains"], (d) => {
          const domains = d.customBlockedDomains || [];
          if (
            !domains.find(
              (x) => (typeof x === "object" ? x.filter : x) === site.filter,
            )
          ) {
            domains.push(site);
            chrome.runtime.sendMessage({ action: "saveCustomSites", domains });
            loadCustomSites();
            renderSiteSuggestions();
          }
        });
      });
    });
  });
}

function loadCustomSites() {
  chrome.storage.local.get(["customBlockedDomains"], (data) => {
    renderSiteList(data.customBlockedDomains || []);
  });
}

function renderSiteList(domains) {
  const list = document.getElementById("siteList");
  if (!list) return;
  list.innerHTML = "";

  if (domains.length === 0) {
    list.innerHTML = '<div class="site-empty">No custom sites added yet.</div>';
    return;
  }

  domains.forEach((domain, i) => {
    const name = typeof domain === "object" ? domain.name : domain;
    const item = document.createElement("div");
    item.className = "site-item";
    const nameEl = document.createElement("span");
    nameEl.textContent = name;
    const removeBtn = document.createElement("button");
    removeBtn.className = "site-remove";
    removeBtn.textContent = "×";
    removeBtn.dataset.index = i;
    removeBtn.addEventListener("click", () => removeCustomSite(i));
    item.appendChild(nameEl);
    item.appendChild(removeBtn);
    list.appendChild(item);
  });
}

function addManualSitePopup() {
  const input = document.getElementById("manualSitePopup");
  if (!input) return;
  let domain = input.value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
  if (!domain || !domain.includes(".")) {
    input.style.borderColor = "#ef4444";
    setTimeout(() => (input.style.borderColor = ""), 2000);
    return;
  }
  const site = { name: domain, filter: `||${domain}^` };
  chrome.storage.local.get(["customBlockedDomains"], (data) => {
    const domains = data.customBlockedDomains || [];
    if (
      !domains.find(
        (x) => (typeof x === "object" ? x.filter : x) === site.filter,
      )
    ) {
      domains.push(site);
      chrome.runtime.sendMessage({ action: "saveCustomSites", domains });
      loadCustomSites();
      renderSiteSuggestions();
    }
    input.value = "";
    document.getElementById("siteSuggestions").style.display = "none";
  });
}

function addCustomSite() {} // kept for compat

function removeCustomSite(index) {
  chrome.storage.local.get(["customBlockedDomains"], (data) => {
    const domains = data.customBlockedDomains || [];
    domains.splice(index, 1);
    chrome.runtime.sendMessage({ action: "saveCustomSites", domains });
    renderSiteList(domains);
    renderSiteSuggestions();
  });
}

// ================================
// UPGRADE FLOW
// ================================
// ================================
// SMART UPGRADE MODAL
// Context: "limit" | "feature" | "streak" | "dashboard"
// ================================
function showUpgradeModal(context = "feature") {
  chrome.storage.local.get(
    ["currentStreak", "totalSessions", "installDate"],
    (data) => {
      const streak = data.currentStreak || 0;
      const totalSessions = data.totalSessions || 0;

      // Calculate days since install for 7-day offer
      const installDate = data.installDate || Date.now();
      const daysSinceInstall = Math.floor(
        (Date.now() - installDate) / 86400000,
      );
      const showOffer = daysSinceInstall >= 7 && daysSinceInstall <= 14;

      // Elements
      const badge = document.getElementById("modalBadge");
      const streakHero = document.getElementById("modalStreakHero");
      const streakNum = document.getElementById("modalStreakNum");
      const emoji = document.getElementById("modalEmoji");
      const title = document.getElementById("modalTitle");
      const body = document.getElementById("modalBody");
      const features = document.getElementById("modalFeatures");
      const offer = document.getElementById("modalOffer");
      const cta = document.getElementById("modalUpgradeBtn");

      // Reset all optional elements
      streakHero.style.display = "none";
      emoji.style.display = "block";
      features.style.display = "none";
      offer.style.display = showOffer ? "block" : "none";

      // ── CONTEXT: SESSION LIMIT HIT ───────────────────────
      if (context === "limit") {
        badge.textContent = "DAILY LIMIT REACHED";

        if (streak >= 3) {
          // They have a streak — lead with it
          streakHero.style.display = "block";
          streakNum.textContent = streak;
          emoji.style.display = "none";
          title.textContent = `Don't break your ${streak}-day streak.`;
          body.textContent =
            "You've hit today's free limit. Pro users go unlimited — keep the momentum.";
        } else {
          emoji.textContent = "🔒";
          title.textContent = "You've used both free sessions.";
          body.textContent =
            "Pro unlocks unlimited daily sessions. Don't stop when you're in flow.";
        }
        features.style.display = "block";
        cta.textContent = "Go Unlimited — ₹499/year →";
      }

      // ── CONTEXT: PRO FEATURE (custom sites, duration etc) ─
      else if (context === "feature") {
        badge.textContent = "PRO FEATURE";
        emoji.textContent = "⚡";
        title.textContent = "This is a Pro feature.";
        body.textContent =
          "Unlock custom site blocking, longer sessions, full dashboard, and streak sync.";
        features.style.display = "block";
        cta.textContent = "Unlock Pro — ₹499/year →";
      }

      // ── CONTEXT: DASHBOARD ────────────────────────────────
      else if (context === "dashboard") {
        badge.textContent = "PRO ANALYTICS";
        emoji.textContent = "📊";
        title.textContent = "See your full focus data.";
        body.textContent = `${totalSessions} sessions completed. Pro unlocks your complete history, streaks, and weekly reports.`;
        cta.textContent = "Unlock Dashboard — ₹499/year →";
      }

      // ── CONTEXT: STREAK (7-day nudge) ────────────────────
      else if (context === "streak") {
        badge.textContent = "PROTECT YOUR STREAK";
        if (streak > 0) {
          streakHero.style.display = "block";
          streakNum.textContent = streak;
          emoji.style.display = "none";
          title.textContent = "Your streak lives locally.";
          body.textContent =
            "Reinstall Chrome and it's gone. Pro syncs your streak to the cloud — safe forever.";
        } else {
          emoji.textContent = "🔥";
          title.textContent = "Start building your streak.";
          body.textContent =
            "Pro users sync their streak across devices. Never lose your progress again.";
        }
        cta.textContent = "Protect My Streak — ₹499/year →";
      }

      // Show modal
      document.getElementById("upgradeModal").style.display = "flex";

      // Save install date if not set (for 7-day offer tracking)
      if (!data.installDate) {
        chrome.storage.local.set({ installDate: Date.now() });
      }
    },
  );
}

function triggerUpgrade() {
  const modal = document.getElementById("upgradeModal");
  if (modal) modal.style.display = "none";
  chrome.runtime.sendMessage({ action: "openPayment" });
}

// ================================
// ACTIVATE LICENSE KEY
// Calls Lemon Squeezy server — no local bypass possible
// ================================
function activateLicenseKey() {
  const input = document.getElementById("licenseKeyInput");
  const feedback = document.getElementById("licenseFeedback");
  const btn = document.getElementById("activateBtn");
  if (!input) return;

  const key = input.value.trim();
  if (!key) {
    if (feedback) {
      feedback.textContent = "Paste your license key first.";
      feedback.style.color = "#ef4444";
    }
    return;
  }

  // Show loading state
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Activating...";
  }
  if (feedback) {
    feedback.textContent = "";
  }

  chrome.runtime.sendMessage(
    { action: "activateLicense", licenseKey: key },
    (res) => {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Activate";
      }

      if (res?.success) {
        isPro = true;
        updateProUI();
        if (feedback) {
          feedback.textContent = "✓ Pro activated! Welcome.";
          feedback.style.color = "#22c55e";
        }
        input.value = "";
      } else {
        if (feedback) {
          feedback.textContent = res?.error || "Invalid key. Check your email.";
          feedback.style.color = "#ef4444";
        }
      }
    },
  );
}

// ================================
// DASHBOARD
// ================================
function openDashboard() {
  if (!isPro) {
    showUpgradeModal("dashboard");
    return;
  }
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
}

// ================================
// SESSION LIMIT (FREE TIER)
// Shows "2/2 sessions used today" bar — hidden for Pro
// ================================
function loadSessionLimit() {
  chrome.runtime.sendMessage({ action: "getTodayCount" }, (res) => {
    if (!res) return;
    const { count, isPro: proStatus, limit } = res;

    const el = document.getElementById("sessionLimitBar");
    if (!el) return;

    // Pro users never see this
    if (proStatus) {
      el.style.display = "none";
      return;
    }

    el.style.display = "block";
    const remaining = Math.max(0, limit - count);
    const pips = el.querySelectorAll(".limit-pip");

    pips.forEach((pip, i) => {
      pip.classList.toggle("used", i < count);
    });

    const label = el.querySelector(".limit-label");
    if (label) {
      if (remaining === 0) {
        label.textContent = "Daily limit reached — resets at midnight";
        label.style.color = "#ef4444";
      } else {
        label.textContent = `${remaining} free session${remaining !== 1 ? "s" : ""} left today`;
        label.style.color = "";
      }
    }
  });
}

// ================================
// DYNAMIC BLOCKED SITE COUNT
// ================================
function loadBlockedSiteCount() {
  // Default 10 sites always blocked for free users
  // Pro users may have custom list
  chrome.storage.local.get(["isPro", "customBlockedDomains"], (data) => {
    const el = document.getElementById("blocksText");
    if (!el) return;

    if (data.isPro && data.customBlockedDomains?.length) {
      const count = data.customBlockedDomains.length;
      el.textContent = `Blocking ${count} custom site${count !== 1 ? "s" : ""}`;
    } else {
      el.textContent = "Blocking 10 sites";
    }
  });
}

// ================================
// SUPABASE SYNC STATE
// Shows signed in / signed out UI
// ================================
function loadSyncState() {
  chrome.runtime.sendMessage({ action: "getSession" }, (res) => {
    const session = res?.session;
    const signedIn = document.getElementById("syncSignedIn");
    const signedOut = document.getElementById("syncSignedOut");
    const emailEl = document.getElementById("syncEmail");

    if (session) {
      if (signedIn) signedIn.style.display = "flex";
      if (signedOut) signedOut.style.display = "none";
      if (emailEl) emailEl.textContent = session.email;
    } else {
      if (signedIn) signedIn.style.display = "none";
      if (signedOut) signedOut.style.display = "block";
    }
  });
}

// ================================
// GOOGLE SIGN IN
// ================================
function handleSignIn() {
  const btn = document.getElementById("signInBtn");
  if (!btn) return;

  btn.disabled = true;
  btn.textContent = "Connecting...";

  chrome.runtime.sendMessage({ action: "signIn" }, (res) => {
    if (res?.success) {
      loadSyncState();
      // Pull cloud settings immediately after sign in
      chrome.runtime.sendMessage({ action: "loadCloudSettings" });

      // Show success flash
      const status = document.getElementById("syncSignedOut");
      if (status) {
        const msg = document.createElement("div");
        msg.style.cssText =
          "font-size:11px;color:#22c55e;text-align:center;padding:6px 0;";
        msg.textContent = "✓ Connected — streak is now safe";
        status.appendChild(msg);
        setTimeout(() => msg.remove(), 3000);
      }
    } else {
      btn.disabled = false;
      btn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        Connect Google`;

      // Show error
      const errEl = document.getElementById("syncSignedOut");
      if (errEl) {
        const err = document.createElement("div");
        err.style.cssText =
          "font-size:11px;color:#ef4444;text-align:center;padding:4px 0;";
        err.textContent = res?.error || "Sign in failed. Try again.";
        errEl.appendChild(err);
        setTimeout(() => err.remove(), 4000);
      }
    }
  });
}

// ================================
// SIGN OUT
// ================================
function handleSignOut() {
  const btn = document.getElementById("signOutBtn");
  if (btn) btn.textContent = "Signing out...";

  chrome.runtime.sendMessage({ action: "signOut" }, () => {
    loadSyncState();
  });
}

// ================================
// DAILY MOTIVATOR
// Rotates by day of week — psychological anchoring
// ================================
const DAILY_MOTIVATORS = [
  {
    day: 0,
    text: "Sunday resets don't mean restart. Compound what you built last week.",
  },
  { day: 1, text: "Monday sets the tone. What you do today echoes all week." },
  {
    day: 2,
    text: "Tuesday is when commitment shows. Anyone can start Monday.",
  },
  {
    day: 3,
    text: "Midweek is where discipline lives. Push through the middle.",
  },
  { day: 4, text: "Thursday. Two days left. Make them count." },
  {
    day: 5,
    text: "Friday focus hits different. The weekend starts when the work is done.",
  },
  {
    day: 6,
    text: "Saturday builders are rare. You're doing what others won't.",
  },
];

function showMotivator() {
  const el = document.getElementById("motivator");
  const textEl = document.getElementById("motivatorText");
  if (!el || !textEl) return;

  const day = new Date().getDay();
  const msg = DAILY_MOTIVATORS.find((m) => m.day === day);
  if (msg) {
    textEl.textContent = msg.text;
    el.style.display = "block";
  }
}

// Call on init
document.addEventListener("DOMContentLoaded", () => {
  // Only run if not already called (may be called in main init)
  setTimeout(showMotivator, 100);
});
