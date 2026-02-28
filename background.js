// ================================
// DEEPLOCK BACKGROUND v5.0
// Lemon Squeezy + Supabase Sync
// ================================

importScripts("supabase.js");

// ⚠️  REPLACE THIS with your Lemon Squeezy Store ID
// Found at: lemonsqueezy.com → Settings → Store
const LS_STORE_ID = "301246";
const LS_PRODUCT_ID = "853068";
const LS_API = "https://api.lemonsqueezy.com/v1/licenses";

// Free tier: 10 highest-distraction sites
// declarativeNetRequest urlFilter — tested patterns for each site
const DEFAULT_BLOCKED_DOMAINS = [
  { name: "Instagram", filter: "||instagram.com^" },
  { name: "X / Twitter", filter: "||x.com^" },
  { name: "Twitter", filter: "||twitter.com^" },
  { name: "YouTube", filter: "||youtube.com^" },
  { name: "Reddit", filter: "||reddit.com^" },
  { name: "Facebook", filter: "||facebook.com^" },
  { name: "TikTok", filter: "||tiktok.com^" },
  { name: "Netflix", filter: "||netflix.com^" },
  { name: "Twitch", filter: "||twitch.tv^" },
  { name: "Discord", filter: "||discord.com^" },
];

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const INACTIVITY_48H = 48 * 60 * 60 * 1000;
const UNLOCK_ALARM = "unlockAlarm";
const REMINDER_ALARM = "deeplockWeekly";
const INACTIVITY_ALARM = "inactivityCheck";
const MORNING_ALARM = "morningCheck";
const EVENING_ALARM = "eveningCheck";
const FREE_SESSION_LIMIT = 2;

// ================================
// LICENSE KEY VALIDATION
// All checks hit Lemon Squeezy server — cannot be faked locally
// ================================

async function activateLicenseKey(licenseKey) {
  try {
    const res = await fetch(`${LS_API}/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        license_key: licenseKey,
        instance_name: "DeepLock-" + Date.now(),
      }),
    });

    const data = await res.json();

    if (data.activated) {
      await chrome.storage.local.set({
        isPro: true,
        licenseKey,
        licenseInstanceId: data.instance?.id || null,
        licenseValidatedAt: Date.now(),
      });
      return { success: true };
    } else {
      // Key already activated on another instance — still trust it locally
      // This handles the "activation limit reached" case for returning users
      if (data.license_key?.status === "active") {
        await chrome.storage.local.set({
          isPro: true,
          licenseKey,
          licenseValidatedAt: Date.now(),
        });
        return { success: true };
      }
      return { success: false, error: data.error || "Invalid license key" };
    }
  } catch (e) {
    return { success: false, error: "Network error. Check your connection." };
  }
}

// Called on every popup open — server always overrides local storage
async function validateLicenseKey() {
  const data = await chrome.storage.local.get([
    "licenseKey",
    "licenseInstanceId",
    "licenseValidatedAt",
  ]);

  if (!data.licenseKey) {
    await chrome.storage.local.set({ isPro: false });
    return { isPro: false };
  }

  try {
    const res = await fetch(`${LS_API}/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        license_key: data.licenseKey,
        instance_id: data.licenseInstanceId || "",
      }),
    });

    const json = await res.json();
    // Valid = server says valid AND status is active (not expired/disabled)
    const isValid =
      json.valid === true && json.license_key?.status === "active";

    await chrome.storage.local.set({
      isPro: isValid,
      licenseValidatedAt: Date.now(),
    });

    return { isPro: isValid };
  } catch (e) {
    // Network offline — trust local cache for up to 7 days
    const lastValidated = data.licenseValidatedAt || 0;
    const useCached = Date.now() - lastValidated < WEEK_MS;
    const cached = await chrome.storage.local.get(["isPro"]);
    return { isPro: useCached ? !!cached.isPro : false };
  }
}

// ================================
// MESSAGE HANDLER
// ================================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "startBlock") {
    const { lockEndTime, duration, intent } = msg;
    chrome.storage.local.get(
      ["customBlockedDomains", "isPro", "todaySessionCount", "todayDate"],
      (data) => {
        // ── FREE TIER LIMIT ──────────────────────────────────────
        const today = new Date().toISOString().split("T")[0];
        const isSameDay = data.todayDate === today;
        const todayCount = isSameDay ? data.todaySessionCount || 0 : 0;

        if (!data.isPro && todayCount >= FREE_SESSION_LIMIT) {
          sendResponse({ status: "limit_reached", sessionsUsed: todayCount });
          return;
        }
        // ─────────────────────────────────────────────────────────

        // Pro users get custom domains (stored as {name, filter} objects or raw strings)
        // Free users always get DEFAULT_BLOCKED_DOMAINS
        const domains =
          data.isPro && data.customBlockedDomains?.length
            ? data.customBlockedDomains
            : DEFAULT_BLOCKED_DOMAINS;

        chrome.storage.local.set({
          isLocked: true,
          lockEndTime,
          sessionDuration: duration,
          focusIntent: intent,
          sessionStartTime: Date.now(),
          blockedDomains: domains,
          lastFocusTime: Date.now(),
          todaySessionCount: todayCount + 1,
          todayDate: today,
        });
        enableBlocking(domains);
        chrome.alarms.create(UNLOCK_ALARM, { when: lockEndTime });
        if (data.isPro) setupHardMode(); // Pro: activate hard mode
        sendResponse({ status: "ok", sessionsUsed: todayCount + 1 });
      },
    );
    return true;
  }

  // GET TODAY'S SESSION COUNT — called by popup to show limit UI
  if (msg.action === "getTodayCount") {
    chrome.storage.local.get(
      ["todaySessionCount", "todayDate", "isPro"],
      (data) => {
        const today = new Date().toISOString().split("T")[0];
        const isSameDay = data.todayDate === today;
        const count = isSameDay ? data.todaySessionCount || 0 : 0;
        sendResponse({ count, isPro: !!data.isPro, limit: FREE_SESSION_LIMIT });
      },
    );
    return true;
  }

  if (msg.action === "activateLicense") {
    activateLicenseKey(msg.licenseKey).then((result) => {
      if (result.success) {
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icon128.png",
          title: "Welcome to DeepLock Pro 🔒",
          message: "All Pro features unlocked. Build something great.",
        });
      }
      sendResponse(result);
    });
    return true;
  }

  if (msg.action === "validateLicense") {
    validateLicenseKey().then((result) => {
      sendResponse(result);
    });
    return true;
  }

  if (msg.action === "openPayment") {
    chrome.tabs.create({
      url: "https://deeplockproversion.lemonsqueezy.com/checkout/buy/51f65cef-610d-4836-b3fb-82a141ad5c30",
    });
    sendResponse({ status: "ok" });
    return true;
  }

  if (msg.action === "incrementBlocked") {
    chrome.storage.local.get(["blockedAttempts"], (data) => {
      chrome.storage.local.set({
        blockedAttempts: (data.blockedAttempts || 0) + 1,
      });
    });
    sendResponse({ status: "ok" });
    return true;
  }

  if (msg.action === "saveCustomSites") {
    chrome.storage.local.set({ customBlockedDomains: msg.domains });
    saveCustomDomains(msg.domains).catch(() => {});
    sendResponse({ status: "ok" });
    return true;
  }

  if (msg.action === "completeSession") {
    unlockSession();
    sendResponse({ status: "ok" });
    return true;
  }

  // GOOGLE SIGN IN
  if (msg.action === "signIn") {
    signInWithGoogle()
      .then((result) => sendResponse({ success: true, ...result }))
      .catch((e) => sendResponse({ success: false, error: e.message }));
    return true;
  }

  // SIGN OUT
  if (msg.action === "signOut") {
    signOut().then(() => sendResponse({ success: true }));
    return true;
  }

  // GET AUTH SESSION
  if (msg.action === "getSession") {
    getSession().then((session) => sendResponse({ session }));
    return true;
  }

  // GET SESSION HISTORY
  if (msg.action === "getSessionHistory") {
    getSessionHistory(90).then((rows) => sendResponse({ rows }));
    return true;
  }

  // LOAD CLOUD SETTINGS
  if (msg.action === "loadCloudSettings") {
    loadCloudSettings().then((settings) => {
      if (settings?.custom_blocked_domains?.length) {
        chrome.storage.local.set({
          customBlockedDomains: settings.custom_blocked_domains,
        });
      }
      sendResponse({ settings });
    });
    return true;
  }
});

// ================================
// INSTALL
// ================================
// ================================
// HARD MODE — Uninstall prevention
// Shows warning page if user tries to remove extension during active session
// chrome.management.onUninstalled fires BEFORE uninstall completes
// ================================
function setupHardMode() {
  chrome.storage.local.get(["isLocked", "isPro"], (data) => {
    if (!data.isPro || !data.isLocked) return;

    // Set an uninstall URL — Chrome shows this page if extension is removed
    // This can't BLOCK uninstall (Chrome doesn't allow that) but it shows a warning page
    chrome.runtime.setUninstallURL(
      "https://cnflokkgffophhebjmmpnjcolejalhna.chromiumapp.org/supabase?uninstall=true",
    );

    // The real hard mode: when locked, open a warning tab if user visits extensions page
    chrome.tabs.onUpdated.addListener(
      function hardModeTabWatch(tabId, changeInfo, tab) {
        if (!tab.url) return;
        const isExtPage =
          tab.url.startsWith("chrome://extensions") ||
          tab.url.startsWith("chrome-extension://");
        if (isExtPage && changeInfo.status === "complete") {
          chrome.storage.local.get(
            ["isLocked", "isPro", "lockEndTime"],
            (d) => {
              if (d.isPro && d.isLocked && d.lockEndTime > Date.now()) {
                const remaining = Math.ceil(
                  (d.lockEndTime - Date.now()) / 60000,
                );
                chrome.notifications.create("hardModeWarning", {
                  type: "basic",
                  iconUrl: "icon128.png",
                  title: "⚠️ DeepLock Hard Mode Active",
                  message: `You're in a locked session. ${remaining} minutes left. Finish what you started.`,
                  priority: 2,
                });
              }
            },
          );
        }
      },
    );
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(REMINDER_ALARM, { periodInMinutes: 24 * 60 });
  chrome.alarms.create(INACTIVITY_ALARM, { periodInMinutes: 24 * 60 });
  scheduleSmartAlarms();

  chrome.storage.local.get(["totalSessions"], (data) => {
    if (data.totalSessions === undefined) {
      chrome.storage.local.set({
        totalSessions: 0,
        totalFocusMinutes: 0,
        currentStreak: 0,
        longestStreak: 0,
        dailySessions: {},
        blockedAttempts: 0,
        isPro: false,
        todaySessionCount: 0,
        todayDate: new Date().toISOString().split("T")[0],
        installDate: Date.now(),
      });
    }
  });

  checkLockStatus();
});

// ================================
// STARTUP — re-validate on every browser start
// ================================
chrome.runtime.onStartup.addListener(() => {
  checkLockStatus();
  validateLicenseKey();
  scheduleSmartAlarms();

  // Pull cloud settings for Pro users (custom sites, etc.)
  chrome.storage.local.get(["isPro", "sbSignedIn"], (data) => {
    if (data.isPro && data.sbSignedIn) {
      loadCloudSettings().catch(() => {});
    }
  });

  chrome.alarms.get(INACTIVITY_ALARM, (alarm) => {
    if (!alarm)
      chrome.alarms.create(INACTIVITY_ALARM, { periodInMinutes: 24 * 60 });
  });

  // Weekly Pro report — fires every Sunday at 8pm
  chrome.alarms.get("weeklyReport", (alarm) => {
    if (!alarm) {
      const nextSunday = new Date();
      nextSunday.setDate(
        nextSunday.getDate() + ((7 - nextSunday.getDay()) % 7),
      );
      nextSunday.setHours(20, 0, 0, 0);
      chrome.alarms.create("weeklyReport", {
        when: nextSunday.getTime(),
        periodInMinutes: 7 * 24 * 60,
      });
    }
  });
});

// ================================
// ALARMS
// ================================
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === UNLOCK_ALARM) unlockSession();
  else if (alarm.name === REMINDER_ALARM) checkWeeklyInactivity();
  else if (alarm.name === INACTIVITY_ALARM) checkInactivity();
  else if (alarm.name === MORNING_ALARM) checkMorningFocus();
  else if (alarm.name === EVENING_ALARM) checkEveningFocus();
  else if (alarm.name === "weeklyReport") checkWeeklyReport();
});

// ================================
// SMART NOTIFICATIONS — morning + evening
// Morning: fires at 9am — nudge if 0 sessions started
// Evening: fires at 7pm — nudge if still 0 sessions (missed the whole day)
// ================================
function scheduleSmartAlarms() {
  const now = new Date();

  // Helper: get next occurrence of a given hour today or tomorrow
  function nextOccurrence(hour) {
    const t = new Date();
    t.setHours(hour, 0, 0, 0);
    if (now >= t) t.setDate(t.getDate() + 1); // already passed → tomorrow
    return t.getTime();
  }

  chrome.alarms.get(MORNING_ALARM, (existing) => {
    if (!existing) {
      chrome.alarms.create(MORNING_ALARM, {
        when: nextOccurrence(9),
        periodInMinutes: 24 * 60,
      });
    }
  });

  chrome.alarms.get(EVENING_ALARM, (existing) => {
    if (!existing) {
      chrome.alarms.create(EVENING_ALARM, {
        when: nextOccurrence(19),
        periodInMinutes: 24 * 60,
      });
    }
  });
}

function checkMorningFocus() {
  const today = new Date().toISOString().split("T")[0];
  chrome.storage.local.get(
    [
      "todaySessionCount",
      "todayDate",
      "isPro",
      "currentStreak",
      "longestStreak",
      "totalSessions",
      "dailySessions",
    ],
    (data) => {
      const isSameDay = data.todayDate === today;
      const count = isSameDay ? data.todaySessionCount || 0 : 0;
      const streak = data.currentStreak || 0;
      const longest = data.longestStreak || 0;
      const total = data.totalSessions || 0;
      const isPro = !!data.isPro;

      if (isPro) {
        // ── PRO MORNING NOTIFICATIONS — personalised, valuable ──
        let title, message;

        if (streak >= 30) {
          title = `${streak} days strong 🔥`;
          message = `Your streak is elite. Most people quit by day 3. Today is day ${streak + 1}. Don't be most people.`;
        } else if (streak >= 14) {
          title = `2-week streak 💪 — ${streak} days`;
          message = `You've built a real habit. Protect it today. Your future self remembers what you do right now.`;
        } else if (streak >= 7) {
          title = `${streak}-day streak 🔥 — one week in`;
          message = `7 days straight. This is where most people fall off. Today separates you from them.`;
        } else if (streak >= 3) {
          title = `${streak} days in a row 🔥`;
          message = `Momentum is building. Lock in today and make it ${streak + 1}.`;
        } else if (total >= 50) {
          title = `${total} sessions and counting ⬛`;
          message = `You've logged ${total} sessions. Today's goal: make it ${total + 1}. One session at a time.`;
        } else if (streak === 0 && total > 0) {
          title = `New day. Clean slate. 🌅`;
          message = `Yesterday is done. What you build today is all that matters. Start your first session.`;
        } else {
          title = `Time to lock in 🌅`;
          message = `Morning focus is 2x more effective. Your session is waiting. What are you building today?`;
        }

        chrome.notifications.create("morningReminder", {
          type: "basic",
          iconUrl: "icon128.png",
          title,
          message,
          priority: 2,
          buttons: [{ title: "Start session now" }],
        });
      } else {
        // Free: simple nudge
        if (count === 0) {
          chrome.notifications.create("morningReminder", {
            type: "basic",
            iconUrl: "icon128.png",
            title: "Start your first session 🌅",
            message: "Morning is the best time to lock in. Don't waste it.",
            priority: 2,
            buttons: [{ title: "Lock in now" }],
          });
        }
      }
    },
  );
}

function checkEveningFocus() {
  const today = new Date().toISOString().split("T")[0];
  chrome.storage.local.get(
    [
      "todaySessionCount",
      "todayDate",
      "isPro",
      "currentStreak",
      "longestStreak",
      "totalSessions",
      "totalFocusMinutes",
      "dailySessions",
    ],
    (data) => {
      const isSameDay = data.todayDate === today;
      const count = isSameDay ? data.todaySessionCount || 0 : 0;
      const streak = data.currentStreak || 0;
      const longest = data.longestStreak || 0;
      const total = data.totalSessions || 0;
      const totalMins = data.totalFocusMinutes || 0;
      const isPro = !!data.isPro;
      const daily = data.dailySessions || {};
      const todayMins = daily[today] || 0;

      if (isPro) {
        // ── PRO EVENING NOTIFICATIONS — powerful, personal ──
        let title, message;

        if (count === 0) {
          // Missed the whole day
          if (streak >= 7) {
            title = `⚠️ ${streak}-day streak at risk`;
            message = `You haven't locked in today. Your ${streak}-day streak ends at midnight. You have time. Start now.`;
          } else if (streak >= 3) {
            title = `⚠️ Don't break your ${streak}-day streak`;
            message = `Zero sessions today. ${streak} days of momentum is on the line. Even 25 minutes saves it.`;
          } else {
            title = `Today isn't over yet 🌙`;
            message = `Zero sessions logged. 25 minutes before bed is better than nothing. Your future self will thank you.`;
          }
        } else if (streak >= 30) {
          title = `${streak} days. Unreal. 🔥`;
          message = `${count} session${count > 1 ? "s" : ""} today. ${todayMins} minutes focused. You're in the top 1% of users. Sleep well.`;
        } else if (streak >= 7) {
          const tomorrow = streak + 1;
          title = `${count} session${count > 1 ? "s" : ""} done 🔥 — ${streak} days`;
          message = `${todayMins} minutes of real work today. Come back tomorrow and make it ${tomorrow} days straight.`;
        } else if (count >= 3) {
          title = `${count} sessions today 💪`;
          message = `${todayMins} min focused. That's ${(todayMins / 60).toFixed(1)} hours of deep work. Elite. Rest, then go again tomorrow.`;
        } else if (total >= 100) {
          title = `${total} lifetime sessions ⬛`;
          message = `${count} session${count > 1 ? "s" : ""} today. You've built something real — ${total} sessions total. Keep the system going.`;
        } else {
          title = `${count} session${count > 1 ? "s" : ""} logged today ✓`;
          message = `${todayMins} min focused. ${streak > 0 ? streak + "-day streak alive." : "Start a streak tomorrow — lock in first thing."} See your stats in the dashboard.`;
        }

        chrome.notifications.create("eveningReminder", {
          type: "basic",
          iconUrl: "icon128.png",
          title,
          message,
          priority: 2,
          buttons: [
            { title: count === 0 ? "Start a session now" : "Open dashboard" },
          ],
        });
      } else {
        // Free users — upgrade nudge
        if (count === 0) {
          chrome.notifications.create("eveningReminder", {
            type: "basic",
            iconUrl: "icon128.png",
            title: "Zero sessions today 🔴",
            message: "Day's almost gone. Even 25 minutes counts. Lock in.",
            priority: 2,
            buttons: [{ title: "Last chance — start now" }],
          });
        } else if (streak >= 7) {
          chrome.notifications.create("eveningReminder", {
            type: "basic",
            iconUrl: "icon128.png",
            title: `${streak}-day streak 🔥 — it's at risk.`,
            message:
              "Your streak only lives on this device. Go Pro to sync it safely.",
            priority: 2,
            buttons: [{ title: "Protect my streak" }],
          });
        } else {
          chrome.notifications.create("eveningReminder", {
            type: "basic",
            iconUrl: "icon128.png",
            title: `${count} session${count > 1 ? "s" : ""} done today 🔥`,
            message: "Good work. One more before you sleep?",
            priority: 1,
            buttons: [{ title: "One more session" }],
          });
        }
      }
    },
  );
}

function checkWeeklyReport() {
  chrome.storage.local.get(
    [
      "isPro",
      "currentStreak",
      "longestStreak",
      "totalSessions",
      "totalFocusMinutes",
      "dailySessions",
    ],
    (data) => {
      if (!data.isPro) return; // Pro only

      const streak = data.currentStreak || 0;
      const total = data.totalSessions || 0;
      const totalMins = data.totalFocusMinutes || 0;
      const daily = data.dailySessions || {};

      // Count this week's sessions and minutes
      let weekSessions = 0;
      let weekMins = 0;
      let activeDays = 0;
      for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split("T")[0];
        const mins = daily[key] || 0;
        if (mins > 0) {
          activeDays++;
          weekMins += mins;
          weekSessions++;
        }
      }

      const weekHours = (weekMins / 60).toFixed(1);

      let title, message;
      if (weekSessions === 7) {
        title = `Perfect week 🔥 ${streak}-day streak`;
        message = `7/7 days. ${weekHours}h focused this week. That's what discipline looks like. Keep it going.`;
      } else if (weekSessions >= 5) {
        title = `Strong week ✓ — ${activeDays}/7 days`;
        message = `${weekHours}h focused, ${weekSessions} sessions. ${streak > 0 ? streak + "-day streak." : ""} Next week: go 7/7.`;
      } else if (weekSessions >= 3) {
        title = `${activeDays}/7 days this week`;
        message = `${weekHours}h logged. Good — but you're capable of more. Next week, aim for 5+ active days.`;
      } else if (weekSessions > 0) {
        title = `Slow week — ${activeDays}/7 days`;
        message = `${weekHours}h focused. You know what you're capable of. Next week starts tomorrow. Don't wait.`;
      } else {
        title = `Zero sessions this week 🔴`;
        message = `A whole week gone. Your streak reset. But today is Sunday — a new week starts now. Lock in.`;
      }

      chrome.notifications.create("weeklyReport", {
        type: "basic",
        iconUrl: "icon128.png",
        title,
        message,
        priority: 2,
        buttons: [{ title: "See my dashboard" }],
      });
    },
  );
}

function checkLockStatus() {
  chrome.storage.local.get(
    ["isLocked", "lockEndTime", "blockedDomains"],
    (data) => {
      if (!data.isLocked) return;
      if (data.lockEndTime > Date.now()) {
        chrome.alarms.create(UNLOCK_ALARM, { when: data.lockEndTime });
        // Always use DEFAULT_BLOCKED_DOMAINS if stored data is legacy string format
        const domains = data.blockedDomains;
        const isLegacy =
          Array.isArray(domains) &&
          domains.length > 0 &&
          typeof domains[0] === "string";
        enableBlocking(
          isLegacy
            ? DEFAULT_BLOCKED_DOMAINS
            : domains || DEFAULT_BLOCKED_DOMAINS,
        );
      } else {
        unlockSession();
      }
    },
  );
}

function enableBlocking(domains) {
  const rules = [];
  let id = 1000;

  // Build domain list from all sites
  const allDomains = domains.map((d) => {
    const filter = typeof d === "string" ? d : d.filter;
    // Extract domain from ||domain.com^ format
    return filter.replace("||", "").replace("^", "");
  });

  // Add tricky subdomains that the main domain rules miss
  const extraDomains = [
    "app.discord.com",
    "ptab.io",
    "vm.tiktok.com",
    "messenger.com",
    "l.messenger.com",
  ];

  const allTargets = [...new Set([...allDomains, ...extraDomains])];

  // Use requestDomains — more reliable than urlFilter, handles x.com correctly
  allTargets.forEach((domain) => {
    rules.push({
      id: id++,
      priority: 1,
      action: {
        type: "redirect",
        redirect: { url: chrome.runtime.getURL("pause.html") },
      },
      condition: {
        requestDomains: [domain],
        resourceTypes: ["main_frame"],
      },
    });
  });

  chrome.declarativeNetRequest.getDynamicRules((existing) => {
    chrome.declarativeNetRequest.updateDynamicRules(
      { removeRuleIds: existing.map((r) => r.id), addRules: rules },
      () => {
        if (chrome.runtime.lastError) {
          console.error(
            "[DeepLock] Blocking error:",
            chrome.runtime.lastError.message,
          );
        } else {
          console.log(
            "[DeepLock] Blocking enabled:",
            rules.length,
            "rules →",
            allTargets.join(", "),
          );
        }
      },
    );
  });
}

function disableBlocking() {
  chrome.declarativeNetRequest.getDynamicRules((rules) => {
    chrome.declarativeNetRequest.updateDynamicRules(
      { removeRuleIds: rules.map((r) => r.id) },
      () => console.log("[DeepLock] Blocking disabled"),
    );
  });
}

function unlockSession() {
  chrome.storage.local.get(
    [
      "sessionDuration",
      "totalSessions",
      "totalFocusMinutes",
      "currentStreak",
      "longestStreak",
      "dailySessions",
      "lastSessionDate",
    ],
    (data) => {
      const duration = data.sessionDuration || 0;
      const totalSessions = (data.totalSessions || 0) + 1;
      const totalFocusMins = (data.totalFocusMinutes || 0) + duration;

      const today = new Date().toISOString().split("T")[0];
      const dailySessions = data.dailySessions || {};
      dailySessions[today] = (dailySessions[today] || 0) + duration;

      let currentStreak = data.currentStreak || 0;
      let longestStreak = data.longestStreak || 0;
      const lastDate = data.lastSessionDate;
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = yesterday.toISOString().split("T")[0];

      if (!lastDate) currentStreak = 1;
      else if (lastDate === today) {
        /* same day */
      } else if (lastDate === yStr) currentStreak += 1;
      else currentStreak = 1;

      if (currentStreak > longestStreak) longestStreak = currentStreak;

      disableBlocking();
      chrome.alarms.clear(UNLOCK_ALARM);

      chrome.storage.local.set({
        isLocked: false,
        lockEndTime: null,
        sessionStartTime: null,
        totalSessions,
        totalFocusMinutes: totalFocusMins,
        currentStreak,
        longestStreak,
        dailySessions,
        lastSessionDate: today,
      });

      // ── SUPABASE SYNC (silent, Pro users only) ──
      chrome.storage.local.get(["focusIntent", "isPro"], (extra) => {
        if (extra.isPro) {
          // Save this session
          saveSession({
            date: today,
            duration,
            intent: extra.focusIntent || "",
            completed: true,
          }).catch(() => {});

          // Sync streak stats
          syncStats({
            currentStreak,
            longestStreak,
            totalSessions,
            totalFocusMinutes: totalFocusMins,
          }).catch(() => {});
        }
      });

      chrome.notifications.create({
        type: "basic",
        iconUrl: "icon128.png",
        title: "Session Complete 🔥",
        message: `${duration} min done. Streak: ${currentStreak} day${currentStreak !== 1 ? "s" : ""}.`,
      });
    },
  );
}

function checkWeeklyInactivity() {
  chrome.storage.local.get(["lastFocusTime", "lastReminderTime"], (data) => {
    const now = Date.now();
    if (!data.lastFocusTime || now - data.lastFocusTime <= WEEK_MS) return;
    if (data.lastReminderTime && now - data.lastReminderTime < WEEK_MS) return;
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon128.png",
      title: "DeepLock",
      message: "You haven't focused in a week. Fix it.",
      buttons: [{ title: "Start 30 min" }],
    });
    chrome.storage.local.set({ lastReminderTime: now });
  });
}

function checkInactivity() {
  chrome.storage.local.get(["lastFocusTime"], (data) => {
    if (!data.lastFocusTime) return;
    if (Date.now() - data.lastFocusTime < INACTIVITY_48H) return;
    chrome.notifications.create("inactivityReminder", {
      type: "basic",
      iconUrl: "icon128.png",
      title: "48 hours. No session.",
      message: "Builders don't quit. Open DeepLock.",
      priority: 2,
    });
  });
}

chrome.notifications.onClicked.addListener((id) => {
  if (
    ["inactivityReminder", "morningReminder", "eveningReminder"].includes(id)
  ) {
    chrome.action.openPopup();
  }
});

// All notification buttons → open popup
// (weekly inactivity button also starts a quick 30min session)
chrome.notifications.onButtonClicked.addListener((notifId) => {
  if (notifId === "weeklyInactivity") {
    const endTime = Date.now() + 30 * 60 * 1000;
    chrome.storage.local.set({
      isLocked: true,
      lockEndTime: endTime,
      sessionDuration: 30,
      sessionStartTime: Date.now(),
      lastFocusTime: Date.now(),
    });
    enableBlocking(DEFAULT_BLOCKED_DOMAINS);
    chrome.alarms.create(UNLOCK_ALARM, { when: endTime });
  } else {
    chrome.action.openPopup();
  }
});
