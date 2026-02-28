// ================================
// DEEPLOCK DASHBOARD v3.0
// Profile + Custom Sites + Supabase history
// ================================

const QUOTES = [
  "Discipline is the bridge between goals and accomplishment.",
  "Every session is a vote for who you're becoming.",
  "The focused mind can pierce through any wall of distraction.",
  "Your future self is watching. Make them proud.",
  "You don't rise to the level of your goals. You fall to the level of your systems.",
  "Deep work is the superpower of our age. You're training it.",
  "Builders build. Every. Single. Day.",
  "The difference between you and your competition is this: you show up.",
];

const DEFAULT_SITES = [
  { name: "Instagram", filter: "||instagram.com^" },
  { name: "X / Twitter", filter: "||x.com^" },
  { name: "YouTube", filter: "||youtube.com^" },
  { name: "Reddit", filter: "||reddit.com^" },
  { name: "Facebook", filter: "||facebook.com^" },
  { name: "TikTok", filter: "||tiktok.com^" },
  { name: "Netflix", filter: "||netflix.com^" },
  { name: "Twitch", filter: "||twitch.tv^" },
  { name: "Discord", filter: "||discord.com^" },
  { name: "Twitter", filter: "||twitter.com^" },
];

const POPULAR_SITES = [
  { name: "LinkedIn", filter: "||linkedin.com^" },
  { name: "Snapchat", filter: "||snapchat.com^" },
  { name: "Pinterest", filter: "||pinterest.com^" },
  { name: "Hacker News", filter: "||news.ycombinator.com^" },
  { name: "Amazon", filter: "||amazon.com^" },
  { name: "Flipkart", filter: "||flipkart.com^" },
  { name: "WhatsApp Web", filter: "||web.whatsapp.com^" },
  { name: "Telegram Web", filter: "||web.telegram.org^" },
  { name: "Spotify", filter: "||spotify.com^" },
  { name: "9GAG", filter: "||9gag.com^" },
];

let customSites = [];

function el(id) {
  return document.getElementById(id);
}
function setText(id, val) {
  const e = el(id);
  if (e) e.textContent = val;
}

// ================================
// INIT
// ================================
document.addEventListener("DOMContentLoaded", () => {
  setDateRange();
  setText(
    "motivationQuote",
    `"${QUOTES[Math.floor(Math.random() * QUOTES.length)]}"`,
  );
  bindTabNav();
  checkActiveSession();
  loadAllData();
  loadProfileTab();
  renderDefaultSites();
  renderPopularSites();
  loadCustomSites();
  bindSiteEvents();
  bindProfileEvents();
});

// ================================
// DATE RANGE
// ================================
function setDateRange() {
  const now = new Date();
  const start = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const fmt = (d, opts) => d.toLocaleDateString("en-US", opts);
  setText(
    "dateRange",
    `${fmt(start, { month: "short", day: "numeric" })} – ${fmt(now, { month: "short", day: "numeric", year: "numeric" })}`,
  );
}

// ================================
// LOAD ALL DATA (local + Supabase)
// ================================
function loadAllData() {
  chrome.storage.local.get(
    [
      "totalSessions",
      "totalFocusMinutes",
      "currentStreak",
      "longestStreak",
      "dailySessions",
      "blockedAttempts",
      "lastSessionDate",
      "sbSignedIn",
      "todaySessionCount",
      "todayDate",
    ],
    async (data) => {
      const sessions = data.totalSessions || 0;
      const totalMins = data.totalFocusMinutes || 0;
      const streak = data.currentStreak || 0;
      const longest = data.longestStreak || 0;
      const daily = data.dailySessions || {};
      const blocked = data.blockedAttempts || 0;
      const totalHours = (totalMins / 60).toFixed(1);
      const today = new Date().toISOString().split("T")[0];

      // Today's count from both sources
      const isSameDay = data.todayDate === today;
      const todayCount = isSameDay ? data.todaySessionCount || 0 : 0;
      const todayMins = daily[today] || 0;

      setText("totalHours", `${totalHours}h`);
      setText("totalSessions", sessions);
      setText("blockedAttempts", blocked);
      setText("currentStreak", `${streak}d`);
      setText("longestStreak", `${longest} days`);
      setText("totalHoursAll", `${totalHours}h`);
      setText(
        "bestDay",
        getBestDay(daily) > 0 ? `${getBestDay(daily)} min` : "—",
      );
      setText(
        "avgSession",
        sessions > 0 ? `${Math.round(totalMins / sessions)} min` : "—",
      );

      const weekMins = getWeekMinutes(daily);
      setText("weekScore", Math.min(100, Math.round((weekMins / 840) * 100)));

      setText("todayMins", todayMins);
      setText("todaySessions", todayCount);
      setTimeout(() => {
        const b = el("todayBarFill");
        if (b) b.style.width = `${Math.min(100, (todayMins / 120) * 100)}%`;
      }, 300);

      // Streaks tab
      setText("streakHeroNum", streak);
      setText(
        "streakSub",
        streak > 0
          ? `${streak} day${streak > 1 ? "s" : ""} in a row. Keep going.`
          : "Start a session to begin your streak.",
      );
      setText("ssCurrentStreak", streak);
      setText("ssLongestStreak", longest);
      setText("ssActiveDays", Object.values(daily).filter((v) => v > 0).length);

      renderBarChart(daily);
      renderHeatmap(daily);

      // Profile sync stats
      setText("cloudSessions", sessions);
      setText("cloudStreak", streak);

      // History — try Supabase first, fall back to local
      if (data.sbSignedIn) {
        try {
          const rows = await getSessionHistory(90);
          if (rows && rows.length > 0) {
            const src = el("historySource");
            if (src) {
              src.textContent = "CLOUD SYNCED";
              src.classList.add("cloud");
            }
            renderCloudHistory(rows);
            return;
          }
        } catch (e) {
          console.log("Cloud history failed, using local:", e);
        }
      }
      renderLocalHistory(daily);
    },
  );
}

// ================================
// PROFILE TAB
// ================================
function loadProfileTab() {
  chrome.storage.local.get(
    [
      "sbSignedIn",
      "sbEmail",
      "sbUserId",
      "licenseKey",
      "currentStreak",
      "totalSessions",
    ],
    (data) => {
      if (data.sbSignedIn && data.sbEmail) {
        el("profileSignedOut").style.display = "none";
        el("profileSignedIn").style.display = "block";
        setText("profileEmail", data.sbEmail);
        const avatar = el("profileAvatar");
        if (avatar) avatar.textContent = data.sbEmail[0].toUpperCase();
        setText("cloudSessions", data.totalSessions || 0);
        setText("cloudStreak", data.currentStreak || 0);
      } else {
        el("profileSignedOut").style.display = "block";
        el("profileSignedIn").style.display = "none";
      }

      // License key
      if (data.licenseKey) {
        const key = data.licenseKey;
        const masked =
          key.length > 8
            ? key.substring(0, 4) + "••••••••" + key.slice(-4)
            : key;
        setText("licenseKeyRow", masked);
      }
    },
  );
}

function bindProfileEvents() {
  const signInBtn = el("dashSignInBtn");
  if (signInBtn) {
    signInBtn.addEventListener("click", async () => {
      signInBtn.disabled = true;
      signInBtn.textContent = "Connecting...";
      const status = el("dashAuthStatus");

      chrome.runtime.sendMessage({ action: "signIn" }, (res) => {
        if (res?.success) {
          if (status) {
            status.style.color = "#22c55e";
            status.textContent = "✓ Connected successfully!";
          }
          loadProfileTab();
          loadAllData(); // reload history with cloud data
        } else {
          signInBtn.disabled = false;
          signInBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg> Sign in with Google`;
          if (status) {
            status.style.color = "#ef4444";
            status.textContent = res?.error || "Sign in failed. Try again.";
          }
        }
      });
    });
  }

  const signOutBtn = el("dashSignOutBtn");
  if (signOutBtn) {
    signOutBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "signOut" }, () => loadProfileTab());
    });
  }

  const resetBtn = el("resetDataBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (confirm("Reset ALL local data? This cannot be undone.")) {
        chrome.storage.local.clear(() => {
          alert("Data reset. Reloading...");
          location.reload();
        });
      }
    });
  }
}

// ================================
// BLOCKED SITES TAB
// ================================
function renderDefaultSites() {
  const grid = el("defaultSitesGrid");
  if (!grid) return;
  grid.innerHTML = DEFAULT_SITES.map(
    (s) => `<div class="default-site-tag">${s.name}</div>`,
  ).join("");
}

function renderPopularSites() {
  const grid = el("popularGrid");
  if (!grid) return;
  grid.innerHTML = POPULAR_SITES.map(
    (s) =>
      `<button class="popular-site-btn" data-name="${s.name}" data-filter="${s.filter}">+ ${s.name}</button>`,
  ).join("");

  grid.querySelectorAll(".popular-site-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const site = { name: btn.dataset.name, filter: btn.dataset.filter };
      if (!customSites.find((s) => s.filter === site.filter)) {
        customSites.push(site);
        saveAndRenderCustom();
      }
    });
  });
}

function loadCustomSites() {
  chrome.storage.local.get(["customBlockedDomains"], (data) => {
    customSites = data.customBlockedDomains || [];
    renderCustomSites();
  });
}

function renderCustomSites() {
  const list = el("customSitesList");
  if (!list) return;

  if (customSites.length === 0) {
    list.innerHTML =
      '<div class="empty-sites">No custom sites yet. Add from the list above or type a domain.</div>';
    return;
  }

  list.innerHTML = customSites
    .map(
      (s, i) =>
        `<div class="custom-site-row">
      <span class="custom-site-name">${typeof s === "object" ? s.name : s}</span>
      <button class="remove-site-btn" data-index="${i}">✕</button>
    </div>`,
    )
    .join("");

  list.querySelectorAll(".remove-site-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      customSites.splice(parseInt(btn.dataset.index), 1);
      saveAndRenderCustom();
    });
  });
}

function saveAndRenderCustom() {
  chrome.runtime.sendMessage({
    action: "saveCustomSites",
    domains: customSites,
  });
  renderCustomSites();
  // Update popular grid — grey out already-added sites
  document.querySelectorAll(".popular-site-btn").forEach((btn) => {
    const added = customSites.find((s) => s.filter === btn.dataset.filter);
    btn.disabled = !!added;
    btn.textContent = added ? `✓ ${btn.dataset.name}` : `+ ${btn.dataset.name}`;
  });
}

function bindSiteEvents() {
  const toggleBtn = el("toggleManualBtn");
  const manualRow = el("manualAddRow");
  const cancelBtn = el("cancelManualBtn");
  const addBtn = el("manualAddBtn");
  const input = el("manualSiteInput");

  if (toggleBtn)
    toggleBtn.addEventListener("click", () => {
      manualRow.style.display = "flex";
      input.focus();
    });
  if (cancelBtn)
    cancelBtn.addEventListener("click", () => {
      manualRow.style.display = "none";
      input.value = "";
    });
  if (addBtn) addBtn.addEventListener("click", addManualSite);
  if (input)
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") addManualSite();
    });
}

function addManualSite() {
  const input = el("manualSiteInput");
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
  if (!customSites.find((s) => s.filter === site.filter)) {
    customSites.push(site);
    saveAndRenderCustom();
  }

  input.value = "";
  el("manualAddRow").style.display = "none";
}

// ================================
// HISTORY RENDERING
// ================================
function renderCloudHistory(rows) {
  const list = el("historyList");
  if (!list) return;
  list.innerHTML = "";

  if (!rows.length) {
    list.innerHTML = '<div class="history-empty">No sessions synced yet.</div>';
    return;
  }

  rows.forEach((row) => {
    const div = document.createElement("div");
    div.className = "history-row";
    const d = new Date(row.created_at);
    const dateStr = d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const dur =
      row.duration >= 60
        ? `${Math.floor(row.duration / 60)}h ${row.duration % 60}m`
        : `${row.duration}m`;

    const dateEl = document.createElement("span");
    dateEl.className = "row-date";
    dateEl.textContent = dateStr;
    const intentEl = document.createElement("span");
    intentEl.className = "row-intent";
    intentEl.textContent = row.intent || "—";
    const durEl = document.createElement("span");
    durEl.className = "row-duration";
    durEl.textContent = dur;
    const statusEl = document.createElement("span");
    statusEl.className = "row-status";
    const badge = document.createElement("span");
    badge.className = "status-badge done";
    badge.textContent = "Done";
    statusEl.appendChild(badge);

    div.appendChild(dateEl);
    div.appendChild(intentEl);
    div.appendChild(durEl);
    div.appendChild(statusEl);
    list.appendChild(div);
  });
}

function renderLocalHistory(daily) {
  const list = el("historyList");
  if (!list) return;
  list.innerHTML = "";

  const entries = Object.entries(daily)
    .filter(([, m]) => m > 0)
    .sort(([a], [b]) => b.localeCompare(a));
  if (!entries.length) {
    list.innerHTML =
      '<div class="history-empty">No sessions yet. Start your first session!</div>';
    return;
  }

  entries.forEach(([date, mins]) => {
    const div = document.createElement("div");
    div.className = "history-row";
    const d = new Date(date + "T00:00:00");
    const dateStr = d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const dur =
      mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;

    const dateEl = document.createElement("span");
    dateEl.className = "row-date";
    dateEl.textContent = dateStr;
    const intentEl = document.createElement("span");
    intentEl.className = "row-intent";
    intentEl.textContent = "—";
    const durEl = document.createElement("span");
    durEl.className = "row-duration";
    durEl.textContent = dur;
    const statusEl = document.createElement("span");
    statusEl.className = "row-status";
    const badge = document.createElement("span");
    badge.className = "status-badge done";
    badge.textContent = "Done";
    statusEl.appendChild(badge);
    div.appendChild(dateEl);
    div.appendChild(intentEl);
    div.appendChild(durEl);
    div.appendChild(statusEl);
    list.appendChild(div);
  });
}

// ================================
// CHARTS
// ================================
function getWeekMinutes(daily) {
  let t = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    t += daily[d.toISOString().split("T")[0]] || 0;
  }
  return t;
}
function getBestDay(daily) {
  const v = Object.values(daily);
  return v.length ? Math.max(0, ...v) : 0;
}

function renderBarChart(daily) {
  const chartEl = el("barChart");
  const labelsEl = el("barLabels");
  if (!chartEl || !labelsEl) return;
  chartEl.innerHTML = "";
  labelsEl.innerHTML = "";
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  const values = days.map((d) => daily[d.toISOString().split("T")[0]] || 0);
  const maxVal = Math.max(...values, 60);
  values.forEach((val, i) => {
    const isToday = i === 6;
    const pct = (val / maxVal) * 100;
    const col = document.createElement("div");
    col.className = "bar-col";
    const bar = document.createElement("div");
    bar.className = ["bar", val === 0 ? "empty" : "", isToday ? "today" : ""]
      .filter(Boolean)
      .join(" ");
    bar.style.height = `${Math.max(pct, 2)}%`;
    const tip = document.createElement("div");
    tip.className = "bar-tooltip";
    tip.textContent = `${val}m`;
    bar.appendChild(tip);
    col.appendChild(bar);
    chartEl.appendChild(col);
    const lbl = document.createElement("div");
    lbl.className = `bar-day${isToday ? " today-label" : ""}`;
    lbl.textContent = isToday ? "Today" : dayNames[days[i].getDay()];
    labelsEl.appendChild(lbl);
  });
}

function renderHeatmap(daily) {
  const heatmap = el("heatmap");
  if (!heatmap) return;
  heatmap.innerHTML = "";
  const cells = [];
  for (let i = 27; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    cells.push({ date: key, mins: daily[key] || 0 });
  }
  const maxMins = Math.max(...cells.map((c) => c.mins), 60);
  cells.forEach(({ date, mins }) => {
    const cell = document.createElement("div");
    const level = mins > 0 ? Math.min(5, Math.ceil((mins / maxMins) * 5)) : 0;
    cell.className = `heat-cell heat-${level}`;
    cell.title = `${date}: ${mins > 0 ? mins + " min" : "No session"}`;
    heatmap.appendChild(cell);
  });
}

// ================================
// TAB NAV
// ================================
function bindTabNav() {
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const tab = item.dataset.tab;
      if (!tab) return;
      document
        .querySelectorAll(".nav-item")
        .forEach((n) => n.classList.remove("active"));
      item.classList.add("active");
      document
        .querySelectorAll(".tab-content")
        .forEach((t) => t.classList.remove("active"));
      const tabEl = el(`tab-${tab}`);
      if (tabEl) tabEl.classList.add("active");
    });
  });
}

// ================================
// ACTIVE SESSION
// ================================
function checkActiveSession() {
  chrome.storage.local.get(["isLocked", "lockEndTime"], (data) => {
    const dot = el("statusDot");
    const label = el("statusLabel");
    if (!dot || !label) return;
    if (data.isLocked && data.lockEndTime > Date.now()) {
      dot.classList.add("active");
      const endTime = data.lockEndTime;
      function update() {
        const r = Math.max(0, endTime - Date.now());
        const m = Math.floor(r / 60000);
        const s = Math.floor((r % 60000) / 1000);
        label.textContent =
          r > 0
            ? `${m}:${s.toString().padStart(2, "0")} left`
            : "Session ended";
        if (r <= 0) clearInterval(iv);
      }
      update();
      const iv = setInterval(update, 1000);
    } else {
      dot.classList.remove("active");
      label.textContent = "No active session";
    }
  });
}
