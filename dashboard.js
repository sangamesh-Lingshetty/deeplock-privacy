// ================================
// DEEPLOCK DASHBOARD v3.0
// Profile + Custom Sites + Supabase history
// ================================

// ================================
// PRO GATE — blocks ALL rendering until license validated
// Strategy: hide body instantly, validate, show or redirect
// ================================
// Flag set to true only after server confirms Pro — dashboard init waits for this
window.__deepLockAllowed = false;

(function proGate() {
  // Hide everything immediately — no flash of dashboard content
  document.documentElement.style.visibility = "hidden";

  function showUpgradeWall() {
    // Replace page content — no more extension JS will run after this
    document.documentElement.style.visibility = "visible";
    document.head.innerHTML = `
      <meta charset="UTF-8"/>
      <title>DeepLock Pro</title>
      <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@400;600;700&display=swap" rel="stylesheet"/>
      <style>
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        body{background:#060608;color:#efefef;font-family:'DM Sans',sans-serif;
             display:flex;align-items:center;justify-content:center;
             min-height:100vh;text-align:center;padding:32px}
        .card{max-width:400px;width:100%}
        .icon{font-size:40px;margin-bottom:20px}
        h1{font-family:'Space Mono',monospace;font-size:22px;margin-bottom:12px}
        p{color:#555;font-size:14px;line-height:1.7;margin-bottom:28px}
        .features{display:flex;flex-direction:column;gap:8px;margin-bottom:28px;text-align:left}
        .feat{font-size:13px;color:#444;display:flex;align-items:center;gap:10px}
        .feat span:first-child{width:20px;text-align:center}
        .btn-primary{display:block;width:100%;background:#3b82f6;color:#fff;
                     border:none;border-radius:10px;padding:14px;font-size:15px;
                     font-weight:700;cursor:pointer;margin-bottom:12px;
                     font-family:'DM Sans',sans-serif;text-decoration:none;
                     line-height:1.4}
        .btn-primary:hover{background:#2563eb}
        .btn-secondary{display:block;width:100%;background:none;color:#444;
                       border:1px solid #1e1e1e;border-radius:10px;padding:12px;
                       font-size:13px;cursor:pointer;font-family:'DM Sans',sans-serif}
        .btn-secondary:hover{border-color:#333;color:#666}
      </style>`;
    document.body.innerHTML = `
      <div class="card">
        <div class="icon">⬛</div>
        <h1>DeepLock Pro</h1>
        <p>The dashboard is a Pro feature. Unlock full analytics, streak history, and scheduled sessions.</p>
        <div class="features">
          <div class="feat"><span>📊</span><span>Full focus analytics &amp; history</span></div>
          <div class="feat"><span>🔥</span><span>Streak sync across devices</span></div>
          <div class="feat"><span>📅</span><span>Scheduled sessions</span></div>
          <div class="feat"><span>⏱</span><span>Unlimited session durations</span></div>
        </div>
        <a id="upgradeLink" class="btn-primary" href="https://deeplockproversion.lemonsqueezy.com/checkout/buy/7b55508e-ee4c-4a87-98ff-c7ddde0ba69a" target="_blank">
          Unlock Pro — $24/year →
        </a>
        <button id="closeBtn" class="btn-secondary">Close</button>
      </div>`;
    // Attach events via JS — no inline onclick (CSP compliant)
    document
      .getElementById("closeBtn")
      .addEventListener("click", () => window.close());
  }

  function allow() {
    window.__deepLockAllowed = true;
    document.documentElement.style.visibility = "visible";
    // Trigger dashboard init if DOM already ready
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initDashboard);
    } else {
      initDashboard();
    }
  }

  // Validate against server first
  chrome.runtime.sendMessage({ action: "validateLicense" }, (res) => {
    if (chrome.runtime.lastError) {
      // SW waking up — ONLY trust local if instanceId exists (proves real purchase)
      chrome.storage.local.get(["isPro", "licenseInstanceId"], (data) => {
        if (data.isPro && data.licenseInstanceId) {
          allow();
        } else {
          showUpgradeWall();
        }
      });
      return;
    }
    if (res?.isPro) {
      allow();
    } else {
      showUpgradeWall();
    }
  });
})();

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
// Called by proGate only after license verified — never called directly
function initDashboard() {
  if (!window.__deepLockAllowed) return; // safety net
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
  loadCustomSites();
  bindSiteEvents();
  bindProfileEvents();
  initScheduleTab();
  initSubscriptionManagement();
  schedTabInited = true;
}

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
        const pOut = el("profileSignedOut");
        if (pOut) pOut.style.display = "none";
        const pIn = el("profileSignedIn");
        if (pIn) pIn.style.display = "block";
        setText("profileEmail", data.sbEmail);
        const avatar = el("profileAvatar");
        if (avatar) avatar.textContent = data.sbEmail[0].toUpperCase();
        setText("cloudSessions", data.totalSessions || 0);
        setText("cloudStreak", data.currentStreak || 0);
      } else {
        const pOut = el("profileSignedOut");
        if (pOut) pOut.style.display = "block";
        const pIn = el("profileSignedIn");
        if (pIn) pIn.style.display = "none";
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

// ================================
// SITE CATEGORIES — comprehensive list
// ================================
const SITE_CATEGORIES = {
  social: [
    { name: "LinkedIn", domain: "linkedin.com" },
    { name: "Snapchat", domain: "snapchat.com" },
    { name: "Pinterest", domain: "pinterest.com" },
    { name: "WhatsApp Web", domain: "web.whatsapp.com" },
    { name: "Telegram Web", domain: "web.telegram.org" },
    { name: "Tumblr", domain: "tumblr.com" },
    { name: "Quora", domain: "quora.com" },
    { name: "BeReal", domain: "bereal.com" },
    { name: "Threads", domain: "threads.net" },
    { name: "Mastodon", domain: "mastodon.social" },
    { name: "Clubhouse", domain: "joinclubhouse.com" },
    { name: "Weibo", domain: "weibo.com" },
  ],
  video: [
    { name: "Twitch", domain: "twitch.tv" },
    { name: "Vimeo", domain: "vimeo.com" },
    { name: "Dailymotion", domain: "dailymotion.com" },
    { name: "Rumble", domain: "rumble.com" },
    { name: "Bilibili", domain: "bilibili.com" },
    { name: "Hotstar", domain: "hotstar.com" },
    { name: "Zee5", domain: "zee5.com" },
    { name: "SonyLiv", domain: "sonyliv.com" },
    { name: "Prime Video", domain: "primevideo.com" },
    { name: "Disney+", domain: "disneyplus.com" },
    { name: "HBO Max", domain: "max.com" },
    { name: "Peacock", domain: "peacocktv.com" },
    { name: "Crunchyroll", domain: "crunchyroll.com" },
    { name: "Plex", domain: "plex.tv" },
  ],
  news: [
    { name: "Hacker News", domain: "news.ycombinator.com" },
    { name: "BBC", domain: "bbc.com" },
    { name: "CNN", domain: "cnn.com" },
    { name: "Times of India", domain: "timesofindia.com" },
    { name: "NDTV", domain: "ndtv.com" },
    { name: "The Hindu", domain: "thehindu.com" },
    { name: "Hindustan Times", domain: "hindustantimes.com" },
    { name: "NY Times", domain: "nytimes.com" },
    { name: "Washington Post", domain: "washingtonpost.com" },
    { name: "Medium", domain: "medium.com" },
    { name: "Substack", domain: "substack.com" },
    { name: "Reddit", domain: "reddit.com" },
    { name: "Feedly", domain: "feedly.com" },
    { name: "Flipboard", domain: "flipboard.com" },
  ],
  shopping: [
    { name: "Amazon", domain: "amazon.in" },
    { name: "Flipkart", domain: "flipkart.com" },
    { name: "Myntra", domain: "myntra.com" },
    { name: "Meesho", domain: "meesho.com" },
    { name: "Nykaa", domain: "nykaa.com" },
    { name: "Ajio", domain: "ajio.com" },
    { name: "Snapdeal", domain: "snapdeal.com" },
    { name: "eBay", domain: "ebay.com" },
    { name: "Etsy", domain: "etsy.com" },
    { name: "Swiggy", domain: "swiggy.com" },
    { name: "Zomato", domain: "zomato.com" },
    { name: "Blinkit", domain: "blinkit.com" },
  ],
  gaming: [
    { name: "Steam", domain: "store.steampowered.com" },
    { name: "Chess.com", domain: "chess.com" },
    { name: "Lichess", domain: "lichess.org" },
    { name: "Miniclip", domain: "miniclip.com" },
    { name: "Poki", domain: "poki.com" },
    { name: "CrazyGames", domain: "crazygames.com" },
    { name: "9GAG", domain: "9gag.com" },
    { name: "iFunny", domain: "ifunny.co" },
    { name: "Epic Games", domain: "epicgames.com" },
    { name: "Roblox", domain: "roblox.com" },
    { name: "Fandom", domain: "fandom.com" },
    { name: "GameFAQs", domain: "gamefaqs.gamespot.com" },
  ],
  productivity: [
    { name: "Slack", domain: "app.slack.com" },
    { name: "Notion", domain: "notion.so" },
    { name: "Trello", domain: "trello.com" },
    { name: "Jira", domain: "atlassian.net" },
    { name: "Asana", domain: "app.asana.com" },
    { name: "Monday.com", domain: "monday.com" },
    { name: "Gmail", domain: "mail.google.com" },
    { name: "Outlook", domain: "outlook.live.com" },
    { name: "Spotify", domain: "open.spotify.com" },
    { name: "Apple Music", domain: "music.apple.com" },
    { name: "Figma", domain: "figma.com" },
    { name: "Canva", domain: "canva.com" },
  ],
};

// All sites flattened — for search
const ALL_SITES_FLAT = Object.values(SITE_CATEGORIES).flat();

let activeCategory = "social";

function loadCustomSites() {
  chrome.storage.local.get(["customBlockedDomains"], (data) => {
    customSites = data.customBlockedDomains || [];
    renderCustomSites();
    renderCategoryGrid(activeCategory);
  });
}

function renderCategoryGrid(cat) {
  const grid = el("categoryGrid");
  if (!grid) return;
  const sites = SITE_CATEGORIES[cat] || [];
  grid.innerHTML = sites
    .map((s) => {
      const filter = `||${s.domain}^`;
      const already = customSites.find(
        (c) => c.filter === filter || c.domain === s.domain,
      );
      return `<button class="cat-site-btn ${already ? "cat-site-added" : ""}"
      data-name="${s.name}" data-domain="${s.domain}" data-filter="${filter}">
      <span class="cat-site-favicon">
        <img src="https://www.google.com/s2/favicons?domain=${s.domain}&sz=16" width="14" height="14" onerror="this.style.display='none'"/>
      </span>
      <span class="cat-site-name">${s.name}</span>
      <span class="cat-site-action">${already ? "✓" : "+"}</span>
    </button>`;
    })
    .join("");

  grid.querySelectorAll(".cat-site-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const filter = btn.dataset.filter;
      const already = customSites.find((s) => s.filter === filter);
      if (already) {
        customSites = customSites.filter((s) => s.filter !== filter);
      } else {
        customSites.push({
          name: btn.dataset.name,
          domain: btn.dataset.domain,
          filter,
        });
      }
      saveAndRenderCustom();
      renderCategoryGrid(activeCategory);
    });
  });
}

function bindCategoryTabs() {
  document.querySelectorAll(".cat-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document
        .querySelectorAll(".cat-tab")
        .forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      activeCategory = tab.dataset.cat;
      renderCategoryGrid(activeCategory);
    });
  });
}

function bindSmartSearch() {
  const input = el("siteSearchInput");
  const results = el("siteSearchResults");
  const clearBtn = el("siteSearchClear");
  if (!input || !results) return;

  let debounceTimer;

  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    clearBtn.style.display = q ? "block" : "none";
    clearTimeout(debounceTimer);

    if (!q) {
      results.style.display = "none";
      return;
    }

    // Local matches from all categories
    const localMatches = ALL_SITES_FLAT.filter(
      (s) =>
        s.name.toLowerCase().includes(q) || s.domain.toLowerCase().includes(q),
    ).slice(0, 5);

    // If the query looks like a domain itself — always show it as a direct-add option
    const looksLikeDomain = /^[a-z0-9-]+\.[a-z]{2,}/.test(q);

    showSearchResults(localMatches, q, looksLikeDomain);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const q = input.value
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .split("/")[0];
      if (q && q.includes(".")) addDomainDirectly(q, q);
    }
  });

  clearBtn.addEventListener("click", () => {
    input.value = "";
    clearBtn.style.display = "none";
    results.style.display = "none";
    input.focus();
  });
}

function showSearchResults(matches, query, showDirectAdd) {
  const results = el("siteSearchResults");
  if (!results) return;

  const items = [...matches];
  const html = items
    .map((s) => {
      const filter = `||${s.domain}^`;
      const already = customSites.find((c) => c.filter === filter);
      return `<div class="search-result-item ${already ? "already-added" : ""}"
      data-name="${s.name}" data-domain="${s.domain}" data-filter="${filter}">
      <img src="https://www.google.com/s2/favicons?domain=${s.domain}&sz=16" width="14" height="14" onerror="this.style.display='none'" style="flex-shrink:0"/>
      <div class="search-result-info">
        <span class="search-result-name">${s.name}</span>
        <span class="search-result-domain">${s.domain}</span>
      </div>
      <span class="search-result-action">${already ? "✓ Added" : "+ Block"}</span>
    </div>`;
    })
    .join("");

  const directHtml =
    showDirectAdd && !matches.find((m) => m.domain === query)
      ? `<div class="search-result-item search-direct-add" data-name="${query}" data-domain="${query}" data-filter="||${query}^">
        <span style="font-size:16px;flex-shrink:0">🌐</span>
        <div class="search-result-info">
          <span class="search-result-name">${query}</span>
          <span class="search-result-domain">Add custom domain</span>
        </div>
        <span class="search-result-action">+ Block</span>
      </div>`
      : "";

  results.innerHTML = html + directHtml;
  results.style.display = html || directHtml ? "block" : "none";

  results.querySelectorAll(".search-result-item").forEach((item) => {
    item.addEventListener("click", () => {
      const filter = item.dataset.filter;
      const already = customSites.find((s) => s.filter === filter);
      if (already) {
        customSites = customSites.filter((s) => s.filter !== filter);
      } else {
        customSites.push({
          name: item.dataset.name,
          domain: item.dataset.domain,
          filter,
        });
      }
      saveAndRenderCustom();
      // Re-render results to show updated state
      const q = el("siteSearchInput")?.value.trim().toLowerCase();
      if (q) {
        const localMatches = ALL_SITES_FLAT.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.domain.toLowerCase().includes(q),
        ).slice(0, 5);
        showSearchResults(localMatches, q, /^[a-z0-9-]+\.[a-z]{2,}/.test(q));
      }
      renderCategoryGrid(activeCategory);
    });
  });
}

function addDomainDirectly(name, domain) {
  const filter = `||${domain}^`;
  if (!customSites.find((s) => s.filter === filter)) {
    customSites.push({ name, domain, filter });
    saveAndRenderCustom();
  }
  const input = el("siteSearchInput");
  if (input) input.value = "";
  const results = el("siteSearchResults");
  if (results) results.style.display = "none";
}

function renderCustomSites() {
  const list = el("customSitesList");
  const divider = el("customDivider");
  const countBadge = el("customSitesCount");
  if (!list) return;

  if (countBadge) countBadge.textContent = `${customSites.length} added`;
  if (divider) divider.style.display = customSites.length > 0 ? "flex" : "none";

  if (customSites.length === 0) {
    list.innerHTML =
      '<div class="empty-sites">Nothing blocked yet. Add from categories above or search any site.</div>';
    return;
  }

  list.innerHTML = customSites
    .map((s, i) => {
      const domain = s.domain || (typeof s === "string" ? s : s.name);
      const name = typeof s === "object" ? s.name : s;
      return `<div class="custom-site-row">
      <img src="https://www.google.com/s2/favicons?domain=${domain}&sz=16" width="14" height="14" style="border-radius:2px" onerror="this.style.display='none'"/>
      <span class="custom-site-name">${name}</span>
      <span class="custom-site-domain">${domain}</span>
      <button class="remove-site-btn" data-index="${i}" title="Remove">✕</button>
    </div>`;
    })
    .join("");

  list.querySelectorAll(".remove-site-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      customSites.splice(parseInt(btn.dataset.index), 1);
      saveAndRenderCustom();
      renderCategoryGrid(activeCategory);
    });
  });
}

function saveAndRenderCustom() {
  chrome.runtime.sendMessage({
    action: "saveCustomSites",
    domains: customSites,
  });
  renderCustomSites();
}

function bindSiteEvents() {
  bindCategoryTabs();
  bindSmartSearch();

  const clearAllBtn = el("clearAllCustomBtn");
  if (clearAllBtn) {
    clearAllBtn.addEventListener("click", () => {
      if (clearAllBtn.dataset.confirm === "1") {
        customSites = [];
        saveAndRenderCustom();
        renderCategoryGrid(activeCategory);
        clearAllBtn.dataset.confirm = "0";
        clearAllBtn.textContent = "Clear all";
      } else {
        clearAllBtn.dataset.confirm = "1";
        clearAllBtn.textContent = "Tap again to confirm";
        setTimeout(() => {
          clearAllBtn.dataset.confirm = "0";
          clearAllBtn.textContent = "Clear all";
        }, 3000);
      }
    });
  }

  // Close search results when clicking outside
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".smart-search-wrap")) {
      const results = el("siteSearchResults");
      if (results) results.style.display = "none";
    }
  });
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
      // Lazy-init schedule tab on first click
      if (tab === "schedule") maybeInitScheduleTab();
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

// ================================
// SCHEDULE TAB
// ================================

function initScheduleTab() {
  const dateInput = el("schedDate");
  const timeInput = el("schedTime");
  const durInput = el("schedDuration");
  const repeatInput = el("schedRepeat");
  const intentInput = el("schedIntent");

  // Default date to tomorrow, time to 9am
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (dateInput) dateInput.value = tomorrow.toISOString().split("T")[0];
  if (timeInput) timeInput.value = "09:00";

  // Live preview of what will happen
  function updatePreview() {
    const d = dateInput?.value;
    const t = timeInput?.value;
    const dur = durInput?.value;
    const rep = repeatInput?.value;
    if (!d || !t || !dur) {
      setText("schedPreview", "—");
      return;
    }

    const dt = new Date(`${d}T${t}`);
    const dayName = dt.toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
    const durLabel = dur >= 60 ? `${dur / 60}h` : `${dur}m`;
    const repLabel = rep === "none" ? "" : ` · Repeats ${rep}`;
    setText(
      "schedPreview",
      `🔒 ${dayName} at ${timeInput.value} — ${durLabel}${repLabel}`,
    );
  }

  [dateInput, timeInput, durInput, repeatInput].forEach((i) => {
    if (i) i.addEventListener("change", updatePreview);
  });
  updatePreview();

  const createBtn = el("schedCreateBtn");
  if (createBtn) createBtn.addEventListener("click", createSchedule);

  // Test button + debug close
  bindScheduleTestBtn();
  const debugClose = el("schedDebugClose");
  if (debugClose)
    debugClose.addEventListener("click", () => {
      const panel = el("schedDebugPanel");
      if (panel) panel.style.display = "none";
    });

  loadSchedules();
}

async function createSchedule() {
  const intent = el("schedIntent")?.value.trim();
  const date = el("schedDate")?.value;
  const time = el("schedTime")?.value;
  const duration = parseInt(el("schedDuration")?.value || "60");
  const repeat = el("schedRepeat")?.value || "none";

  schedDebug("── createSchedule called ──");
  schedDebug(
    `intent="${intent}" date="${date}" time="${time}" dur=${duration} repeat="${repeat}"`,
  );

  // Validate
  if (!date || !time) {
    showSchedFeedback("Pick a date and time first.", "error");
    return;
  }

  // FIX: parse as local time by NOT calling .toISOString()
  // Store as "YYYY-MM-DDTHH:mm" — background converts with new Date() which respects local tz
  const scheduledAt = `${date}T${time}`;
  const scheduledMs = new Date(scheduledAt).getTime();
  schedDebug(
    `scheduledAt="${scheduledAt}" ms=${scheduledMs} now=${Date.now()}`,
  );

  if (scheduledMs <= Date.now()) {
    showSchedFeedback("That time is in the past. Pick a future time.", "error");
    schedDebug("BLOCKED: time is in the past");
    return;
  }
  if (!intent) {
    el("schedIntent")?.focus();
    showSchedFeedback("Add what you'll work on.", "error");
    return;
  }

  const createBtn = el("schedCreateBtn");
  if (createBtn) {
    createBtn.disabled = true;
    createBtn.textContent = "Saving...";
  }

  const resetBtn = () => {
    if (createBtn) {
      createBtn.disabled = false;
      createBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor"><path d="M6.5 1v11M1 6.5h11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg> Schedule Session`;
    }
  };

  try {
    const id = `sched_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    // Store scheduledAt as local datetime string — background uses new Date(scheduledAt).getTime()
    const schedule = {
      id,
      intent,
      scheduledAt,
      scheduledMs,
      duration,
      repeat,
      active: true,
    };
    schedDebug(`id=${id}`);

    // STEP 1: Save locally immediately
    const local = await chrome.storage.local.get(["schedules"]);
    const schedules = local.schedules || [];
    schedules.push({ ...schedule, synced: false });
    await chrome.storage.local.set({ schedules });
    schedDebug(`✓ Local storage saved (${schedules.length} total)`);

    // STEP 2: Register alarm via background — use scheduledMs directly
    const alarmResponse = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          action: "registerScheduleAlarm",
          schedule: { ...schedule, scheduledMs },
        },
        (resp) => {
          if (chrome.runtime.lastError)
            resolve({ error: chrome.runtime.lastError.message });
          else resolve(resp || { status: "no response" });
        },
      );
    });
    schedDebug(`✓ Alarm: ${JSON.stringify(alarmResponse)}`);

    // STEP 3: Show success
    showSchedFeedback(
      "✓ Scheduled! DeepLock will auto-lock at that time.",
      "success",
    );
    resetBtn();
    const intentEl = el("schedIntent");
    if (intentEl) intentEl.value = "";
    loadSchedules();

    // STEP 4: Supabase in background — never blocks UI
    saveSchedule({
      ...schedule,
      scheduledAt: new Date(scheduledMs).toISOString(),
    })
      .then((result) => {
        schedDebug(
          `Supabase: ok=${result.ok}${result.reason ? " reason=" + result.reason : ""}${result.error ? " error=" + result.error : ""}`,
        );
        if (result.ok) {
          chrome.storage.local.get(["schedules"], (d) => {
            const updated = (d.schedules || []).map((s) =>
              s.id === id ? { ...s, synced: true } : s,
            );
            chrome.storage.local.set({ schedules: updated });
          });
        }
      })
      .catch((e) => schedDebug(`Supabase error (non-fatal): ${e.message}`));
  } catch (e) {
    schedDebug(`✗ createSchedule error: ${e.message}`);
    showSchedFeedback("Something went wrong. Check console.", "error");
    resetBtn();
  }
}

// ── DEBUG HELPERS ─────────────────────────────────────────────
function schedDebug(msg) {
  try {
    console.log("[DeepLock Schedule]", msg);
    const panel = el("schedDebugPanel");
    const log = el("schedDebugLog");
    if (!panel || !log) return;
    panel.style.display = "block";
    const line = document.createElement("div");
    line.className = "sched-debug-line";
    line.textContent = `${new Date().toLocaleTimeString()} ${msg}`;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
  } catch (_) {
    /* never let debug crash the app */
  }
}

function registerScheduleAlarm(schedule) {
  const fireTime = new Date(schedule.scheduledAt).getTime();
  if (fireTime <= Date.now()) return;
  // Alarms must be created in the service worker, not the dashboard page
  chrome.runtime.sendMessage({ action: "registerScheduleAlarm", schedule });
}

async function loadSchedules() {
  // ALWAYS load from local storage first — instant, never fails
  const local = await chrome.storage.local.get(["schedules"]);
  const localSchedules = (local.schedules || []).filter(
    (s) => s.active !== false,
  );

  const now = new Date();
  const upcoming = localSchedules
    .filter((s) => {
      if (s.repeat && s.repeat !== "none") return true;
      return new Date(s.scheduled_at || s.scheduledAt) > now;
    })
    .sort(
      (a, b) =>
        new Date(a.scheduled_at || a.scheduledAt) -
        new Date(b.scheduled_at || b.scheduledAt),
    );

  renderSchedules(upcoming);
  setText("schedCount", `${upcoming.length} scheduled`);
  schedDebug(`loadSchedules: ${upcoming.length} upcoming from local`);

  // Sync from Supabase in background — update display if more data found
  getSchedules()
    .then((remote) => {
      if (!remote || !remote.length) return;
      schedDebug(`Supabase has ${remote.length} schedules`);
      // Merge remote into local — remote is source of truth for synced entries
      chrome.storage.local.get(["schedules"], (d) => {
        const merged = mergeSchedules(d.schedules || [], remote);
        chrome.storage.local.set({ schedules: merged });
        // Re-render with merged data
        const upd = merged
          .filter((s) => s.active !== false)
          .filter((s) => {
            if (s.repeat && s.repeat !== "none") return true;
            return new Date(s.scheduled_at || s.scheduledAt) > new Date();
          })
          .sort(
            (a, b) =>
              new Date(a.scheduled_at || a.scheduledAt) -
              new Date(b.scheduled_at || b.scheduledAt),
          );
        renderSchedules(upd);
        setText("schedCount", `${upd.length} scheduled`);
      });
    })
    .catch(() => {
      /* offline — local is fine */
    });
}

function mergeSchedules(local, remote) {
  const map = {};
  // Local entries first
  (local || []).forEach((s) => {
    map[s.id] = s;
  });
  // Remote overwrites (they're the synced truth)
  (remote || []).forEach((s) => {
    map[s.id] = {
      ...s,
      scheduledAt: s.scheduled_at || s.scheduledAt, // normalise key
      synced: true,
    };
  });
  return Object.values(map);
}

function renderSchedules(schedules) {
  const list = el("schedList");
  if (!list) return;

  if (!schedules.length) {
    list.innerHTML = `
      <div class="sched-empty">
        <div class="sched-empty-icon">📅</div>
        <div class="sched-empty-text">No sessions scheduled yet.</div>
        <div class="sched-empty-sub">Set one up above — DeepLock will lock automatically.</div>
      </div>`;
    return;
  }

  list.innerHTML = schedules
    .map((s) => {
      const dt = new Date(s.scheduled_at || s.scheduledAt);
      const dateStr = dt.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      const timeStr = dt.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });
      const dur = s.duration >= 60 ? `${s.duration / 60}h` : `${s.duration}m`;
      const rep =
        s.repeat && s.repeat !== "none"
          ? `<span class="sched-repeat-badge">${s.repeat}</span>`
          : "";
      const id = s.id;
      const minsUntil = Math.round((dt - Date.now()) / 60000);
      const countdown =
        minsUntil < 60
          ? `<span class="sched-soon">in ${minsUntil}m</span>`
          : minsUntil < 1440
            ? `<span class="sched-timing">in ${Math.floor(minsUntil / 60)}h</span>`
            : `<span class="sched-timing">in ${Math.floor(minsUntil / 1440)}d</span>`;

      return `
      <div class="sched-card" data-id="${id}">
        <div class="sched-card-left">
          <div class="sched-card-time">
            <span class="sched-date">${dateStr}</span>
            <span class="sched-clock">${timeStr}</span>
            ${countdown}
          </div>
          <div class="sched-card-intent">${s.intent || "Focus session"}</div>
          <div class="sched-card-meta">
            <span class="sched-dur-badge">${dur}</span>
            ${rep}
          </div>
        </div>
        <button class="sched-delete-btn" data-id="${id}" title="Remove">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
        </button>
      </div>`;
    })
    .join("");

  list.querySelectorAll(".sched-delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => deleteScheduleById(btn.dataset.id));
  });
}

async function deleteScheduleById(id) {
  // Tell background to clear the alarm
  chrome.runtime.sendMessage({ action: "clearScheduleAlarm", scheduleId: id });

  // Remove from Supabase
  try {
    await deleteSchedule(id);
  } catch (e) {
    /* offline */
  }

  // Remove from local
  const local = await chrome.storage.local.get(["schedules"]);
  const updated = (local.schedules || []).filter((s) => s.id !== id);
  await chrome.storage.local.set({ schedules: updated });

  loadSchedules();
}

function showSchedFeedback(msg, type) {
  const fb = el("schedFeedback");
  if (!fb) return;
  fb.textContent = msg;
  fb.style.color = type === "error" ? "#ef4444" : "#22c55e";
  setTimeout(() => {
    fb.textContent = "";
  }, 4000);
}

// Schedule tab init guard
// ── TEST HELPER ──────────────────────────────────────────────
function bindScheduleTestBtn() {
  const btn = el("schedTestBtn");
  const status = el("schedTestStatus");
  if (!btn) return;
  btn.addEventListener("click", () => {
    btn.disabled = true;
    btn.textContent = "Sending...";
    chrome.runtime.sendMessage({ action: "testScheduleIn65s" }, (resp) => {
      if (chrome.runtime.lastError) {
        if (status)
          status.textContent = "Error: " + chrome.runtime.lastError.message;
        schedDebug(
          "testScheduleIn65s error: " + chrome.runtime.lastError.message,
        );
        btn.disabled = false;
        return;
      }
      schedDebug(
        `✓ Test alarm set! id=${resp.testId} fires at ${resp.firesAt}`,
      );
      if (status)
        status.textContent = `✓ Alarm set — session will start at ${resp.firesAt}`;
      btn.textContent = "⚡ Test pending...";
      // Reload schedules to show the test entry
      loadSchedules();
    });
  });
}

let schedTabInited = false;
function maybeInitScheduleTab() {
  if (schedTabInited) {
    loadSchedules();
    return;
  }
  schedTabInited = true;
  initScheduleTab();
}

// ================================
// SUBSCRIPTION MANAGEMENT
// Smart retention flow before cancel
// ================================

const LS_STORE_SLUG = "deeplock"; // your Lemon Squeezy store slug
const LS_BILLING_URL = `https://${LS_STORE_SLUG}.lemonsqueezy.com/billing`;

function initSubscriptionManagement() {
  // Populate retention stats
  chrome.storage.local.get(
    ["currentStreak", "totalSessions", "licenseKey"],
    (data) => {
      const streak = data.currentStreak || 0;
      const sessions = data.totalSessions || 0;
      const key = data.licenseKey || "";

      setText("retentionStreak", `${streak}d`);
      setText("retentionSessions", sessions);

      // Masked license key display
      if (key) {
        const masked =
          key.length > 8
            ? key.substring(0, 4) + "••••••••" + key.slice(-4)
            : key;
        setText("licenseKeyRow", masked);
      }

      // Renewal label — you can wire this from your webhook data later
      const renewsEl = el("subRenewsLabel");
      if (renewsEl) renewsEl.textContent = ""; // can populate from storage if you store renewal date
    },
  );

  // ── Step 0: trigger → Step 1 ──────────────────────
  const cancelTrigger = el("subCancelTrigger");
  if (cancelTrigger) {
    cancelTrigger.addEventListener("click", () => {
      showSubState("retention");
    });
  }

  // ── Update payment method ─────────────────────────
  const updatePayBtn = el("updatePaymentBtn");
  if (updatePayBtn) {
    updatePayBtn.href = LS_BILLING_URL;
  }

  // ── Step 1: Retention → Keep or Continue ──────────
  const keepBtn = el("retentionKeepBtn");
  if (keepBtn) keepBtn.addEventListener("click", () => showSubState("active"));

  const continueBtn = el("retentionContinueBtn");
  if (continueBtn)
    continueBtn.addEventListener("click", () => showSubState("pause"));

  // ── Step 2: Pause offer ───────────────────────────
  document.querySelectorAll(".pause-option-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      // Open billing portal — user can pause there
      // In future: call LS API to pause directly
      window.open(LS_BILLING_URL, "_blank");
    });
  });

  const pauseKeepBtn = el("pauseKeepBtn");
  if (pauseKeepBtn)
    pauseKeepBtn.addEventListener("click", () => showSubState("active"));

  const pauseContinueBtn = el("pauseContinueBtn");
  if (pauseContinueBtn)
    pauseContinueBtn.addEventListener("click", () => showSubState("reason"));

  // ── Step 3: Reason picker ─────────────────────────
  document.querySelectorAll('input[name="cancelReason"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      const confirmBtn = el("reasonConfirmBtn");
      if (confirmBtn) confirmBtn.disabled = false;
    });
  });

  const reasonBackBtn = el("reasonBackBtn");
  if (reasonBackBtn)
    reasonBackBtn.addEventListener("click", () => showSubState("pause"));

  const reasonConfirmBtn = el("reasonConfirmBtn");
  if (reasonConfirmBtn) {
    reasonConfirmBtn.addEventListener("click", () => {
      const selected = document.querySelector(
        'input[name="cancelReason"]:checked',
      );
      const reason = selected ? selected.value : "unknown";

      // Log the reason locally for your analytics
      chrome.storage.local.get(["cancelReasons"], (data) => {
        const reasons = data.cancelReasons || [];
        reasons.push({ reason, date: new Date().toISOString() });
        chrome.storage.local.set({ cancelReasons: reasons });
      });

      // Open Lemon Squeezy customer portal — they complete cancel there
      window.open(LS_BILLING_URL, "_blank");

      // Show a soft "we hope to see you back" message
      showSubState("active");
      showCancelConfirmMessage();
    });
  }
}

function showSubState(state) {
  const states = ["active", "retention", "pause", "reason"];
  states.forEach((s) => {
    const el_s = el(`subState${s.charAt(0).toUpperCase() + s.slice(1)}`);
    if (el_s) el_s.style.display = s === state ? "block" : "none";
  });
}

function showCancelConfirmMessage() {
  const card = el("subscriptionCard");
  if (!card) return;
  const msg = document.createElement("div");
  msg.className = "cancel-confirm-msg";
  msg.innerHTML = `
    <span>Portal opened. Your Pro access stays active until your billing period ends.</span>
    <span class="cancel-confirm-sub">We hope to see you back. Your streak and data are always here.</span>
  `;
  // Remove after 8s
  card.appendChild(msg);
  setTimeout(() => msg.remove(), 8000);
}

// initSubscriptionManagement is called from initDashboard above
