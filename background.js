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
const LS_CHECKOUT_URL =
  "https://deeplockproversion.lemonsqueezy.com/checkout/buy/7b55508e-ee4c-4a87-98ff-c7ddde0ba69a";

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

const SMART_LOCK_PRESET_SITES = [
  { name: "YouTube", domain: "youtube.com" },
  { name: "X", domain: "x.com" },
  { name: "Twitter", domain: "twitter.com" },
  { name: "Instagram", domain: "instagram.com" },
  { name: "Reddit", domain: "reddit.com" },
  { name: "Facebook", domain: "facebook.com" },
  { name: "TikTok", domain: "tiktok.com" },
  { name: "Netflix", domain: "netflix.com" },
  { name: "Twitch", domain: "twitch.tv" },
  { name: "Discord", domain: "discord.com" },
];
const SMART_LOCK_DEFAULT_ENABLED = new Set([
  "youtube.com",
  "x.com",
  "twitter.com",
  "instagram.com",
  "reddit.com",
  "facebook.com",
  "tiktok.com",
]);
const DISTRACTING_DOMAINS = new Set([
  "youtube.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "reddit.com",
  "facebook.com",
  "tiktok.com",
]);

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const INACTIVITY_48H = 48 * 60 * 60 * 1000;
const UNLOCK_ALARM = "unlockAlarm";
const REMINDER_ALARM = "deeplockWeekly";
const INACTIVITY_ALARM = "inactivityCheck";
const MORNING_ALARM = "morningCheck";
const EVENING_ALARM = "eveningCheck";
const AUTO_KILL_ALARM = "autoKillAlarm";
const FREE_SESSION_LIMIT = 4;
const SITE_USAGE_KEY = "siteUsage";
const SITE_USAGE_TRACKING_KEY = "siteUsageTrackingState";
const AUTO_KILL_STATE_KEY = "autoKillTrackingState";
const SESSION_LOG_KEY = "focusSessionLog";
const TEMP_BYPASS_STRICT_MODE_PRO_FOR_TESTING = false;

function buildCheckoutUrl(baseUrl, { userId, email } = {}) {
  try {
    const url = new URL(baseUrl);
    if (email) {
      url.searchParams.set("checkout[email]", email);
      url.searchParams.set("checkout[custom][email]", email);
    }
    if (userId) {
      url.searchParams.set("checkout[custom][user_id]", userId);
    }
    return url.toString();
  } catch {
    return baseUrl;
  }
}
let isSessionActive = false;
let autoKillCurrentDomain = null;
let autoKillStartTime = null;
let autoKillInterval = null;
let autoKillPopupWindowId = null;
let autoKillPopupOpen = false;
let autoKillTriggerMinutes = null;

function clearAutoKillTimer(resetDomain = true) {
  if (autoKillInterval) {
    clearInterval(autoKillInterval);
    autoKillInterval = null;
  }
  chrome.alarms.clear(AUTO_KILL_ALARM);
  if (resetDomain) {
    autoKillCurrentDomain = null;
    autoKillStartTime = null;
    autoKillTriggerMinutes = null;
    chrome.storage.local.remove(AUTO_KILL_STATE_KEY);
  }
}

function clearSessionRuntime(callback) {
  isSessionActive = false;
  disableBlocking(() => {
    chrome.alarms.clear(UNLOCK_ALARM);
    chrome.runtime.setUninstallURL("", () => {
      void chrome.runtime.lastError;
      if (typeof callback === "function") callback();
    });
  });
}

function resetStoredSessionState(extra = {}) {
  chrome.storage.local.set({
    isLocked: false,
    lockEndTime: null,
    blockedDomains: [],
    sessionDuration: null,
    sessionStartTime: null,
    focusIntent: "",
    lastFocusTime: null,
    sessionPinHash: null,
    sessionEnergyLevel: null,
    sessionBlockedAttempts: 0,
    scheduledSessionId: null,
    ...extra,
  });
}

function normalizeAutoKillDomain(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/^\|\|/, "")
    .replace(/\^$/, "")
    .split("/")[0]
    .trim();
}

function buildAutoKillSiteSettings(customBlockedDomains, storedSettings, fallbackMinutes) {
  const presetSites = SMART_LOCK_PRESET_SITES.map((site) => ({
    name: site.name,
    domain: site.domain,
  }));
  const customSites = (customBlockedDomains || [])
    .map((site) => ({
      name: site.name || normalizeAutoKillDomain(site.domain || site.filter),
      domain: normalizeAutoKillDomain(site.domain || site.filter),
    }))
    .filter((site) => site.domain);

  const uniqueSites = [];
  const seen = new Set();
  [...presetSites, ...customSites].forEach((site) => {
    if (!site.domain || seen.has(site.domain)) return;
    seen.add(site.domain);
    uniqueSites.push(site);
  });

  return uniqueSites.map((site) => {
    const saved = storedSettings?.[site.domain] || {};
    return {
      name: site.name,
      domain: site.domain,
      enabled:
        saved.enabled !== undefined
          ? !!saved.enabled
          : SMART_LOCK_DEFAULT_ENABLED.has(site.domain),
      minutes: Math.max(
        1,
        Math.min(180, parseInt(saved.minutes || fallbackMinutes || 10, 10) || 10),
      ),
    };
  });
}

async function getAutoKillSiteSettings() {
  const data = await chrome.storage.local.get([
    "customBlockedDomains",
    "autoKillSites",
    "autoKillMinutes",
  ]);
  return buildAutoKillSiteSettings(
    data.customBlockedDomains || [],
    data.autoKillSites || {},
    Number(data.autoKillMinutes) || 10,
  );
}

async function getAutoKillMatch(domain) {
  if (!domain) return null;
  const settings = await getAutoKillSiteSettings();
  return (
    settings.find(
      (site) =>
        site.enabled &&
        (domain === site.domain || domain.endsWith(`.${site.domain}`)),
    ) || null
  );
}

async function triggerKillSwitch(domain, autoKillMinutes) {
  if (autoKillPopupOpen) return;
  autoKillPopupOpen = true;
  const strictSettings = await chrome.storage.local.get(["autoKillStrictMode", "isPro"]);
  const strictMode =
    !!strictSettings.autoKillStrictMode &&
    (!!strictSettings.isPro || TEMP_BYPASS_STRICT_MODE_PRO_FOR_TESTING);
  await chrome.storage.local.set({
    autoKillIntervention: {
      domain,
      minutes: autoKillMinutes,
      strictMode,
      triggeredAt: Date.now(),
    },
  });

  const stateData = await chrome.storage.local.get([AUTO_KILL_STATE_KEY]);
  const targetTabId = stateData[AUTO_KILL_STATE_KEY]?.tabId;

  if (targetTabId) {
    chrome.scripting.executeScript(
      {
        target: { tabId: targetTabId },
        files: ["smartlock_overlay.js"],
      },
      () => {
        if (chrome.runtime.lastError) {
          autoKillPopupOpen = false;
          autoKillPopupWindowId = null;
          chrome.tabs.create({ url: chrome.runtime.getURL("auto_kill.html"), active: true });
          return;
        }

        chrome.tabs.sendMessage(
          targetTabId,
          { action: "showAutoKillOverlay", domain, minutes: autoKillMinutes, strictMode },
          (response) => {
            if (chrome.runtime.lastError || !response?.ok) {
              autoKillPopupOpen = false;
              autoKillPopupWindowId = null;
              chrome.tabs.create({ url: chrome.runtime.getURL("auto_kill.html"), active: true });
            }
          },
        );
      },
    );
    return;
  }

  autoKillPopupOpen = false;
  chrome.tabs.create({ url: chrome.runtime.getURL("auto_kill.html"), active: true });
}

async function maybeTrackAutoKill(tab) {
  const settings = await chrome.storage.local.get(["autoKillEnabled", "autoKillMinutes"]);
  if (!settings.autoKillEnabled) {
    clearAutoKillTimer();
    return;
  }

  const domain = normalizeTrackedDomain(tab?.url);
  const matchedSite = await getAutoKillMatch(domain);
  if (!matchedSite) {
    clearAutoKillTimer();
    return;
  }

  if (
    autoKillCurrentDomain === domain &&
    autoKillStartTime &&
    autoKillTriggerMinutes === matchedSite.minutes
  ) {
    return;
  }

  if (autoKillCurrentDomain === domain && autoKillStartTime) {
    autoKillTriggerMinutes = matchedSite.minutes;
    await chrome.storage.local.set({
      [AUTO_KILL_STATE_KEY]: {
        domain,
        startedAt: autoKillStartTime,
        minutes: autoKillTriggerMinutes,
        tabId: tab?.id ?? null,
        windowId: tab?.windowId ?? null,
      },
    });
    const elapsed = Date.now() - autoKillStartTime;
    if (elapsed >= autoKillTriggerMinutes * 60 * 1000) {
      clearAutoKillTimer(false);
      await triggerKillSwitch(domain, autoKillTriggerMinutes);
      return;
    }
    chrome.alarms.create(AUTO_KILL_ALARM, {
      when: autoKillStartTime + autoKillTriggerMinutes * 60 * 1000,
    });
    return;
  }

  clearAutoKillTimer(false);
  autoKillCurrentDomain = domain;
  autoKillStartTime = Date.now();
  autoKillTriggerMinutes = matchedSite.minutes;
  await chrome.storage.local.set({
    [AUTO_KILL_STATE_KEY]: {
      domain,
      startedAt: autoKillStartTime,
      minutes: autoKillTriggerMinutes,
      tabId: tab?.id ?? null,
      windowId: tab?.windowId ?? null,
    },
  });
  chrome.alarms.create(AUTO_KILL_ALARM, {
    when: autoKillStartTime + autoKillTriggerMinutes * 60 * 1000,
  });
}

function getTodayKey() {
  return new Date().toISOString().split("T")[0];
}

function getDistractingMinutesFromSites(sites) {
  return Object.entries(sites || {}).reduce((sum, [domain, minutes]) => {
    return sum + (DISTRACTING_DOMAINS.has(normalizeTrackedDomain(`https://${domain}`) || domain) ? Number(minutes) || 0 : 0);
  }, 0);
}

function getFocusScoreFromSites(sites) {
  const total = Object.values(sites || {}).reduce(
    (sum, value) => sum + (Number(value) || 0),
    0,
  );
  if (total <= 0) return 100;
  const distracting = getDistractingMinutesFromSites(sites);
  return Math.max(0, Math.min(100, Math.round(((total - distracting) / total) * 100)));
}

function getTopFocusHourFromLog(entries, dateKey) {
  const hourMap = {};
  (entries || [])
    .filter((entry) => (entry.date || "").startsWith(dateKey))
    .forEach((entry) => {
      const hour = Number(entry.hour);
      if (!Number.isFinite(hour)) return;
      hourMap[hour] = (hourMap[hour] || 0) + (Number(entry.duration) || 0);
    });
  const pairs = Object.entries(hourMap);
  if (!pairs.length) return null;
  pairs.sort((a, b) => b[1] - a[1]);
  return Number(pairs[0][0]);
}

function mapCloudHistoryToLocal(rows) {
  return (rows || []).map((row, index) => {
    const dateValue =
      row.date ||
      (row.created_at
        ? row.created_at.split("T")[0]
        : getTodayKey());
    return {
      id: row.id || `${dateValue}_${index}`,
      date: dateValue,
      completedAt: row.created_at || `${dateValue}T12:00:00`,
      duration: Number(row.duration) || 0,
      energyLevel: row.energy_level || null,
      blockedAttempts: Number(row.blocked_attempts) || 0,
      intent: row.intent || "",
      hour:
        Number.isFinite(row.start_hour) && row.start_hour >= 0
          ? Number(row.start_hour)
          : 12,
      source: row.source || "cloud",
      completed: row.completed !== false,
    };
  });
}

function mapCloudDailyStatsToLocal(rows) {
  return (rows || []).reduce((acc, row) => {
    if (!row?.date) return acc;
    acc[row.date] = Number(row.focus_minutes) || 0;
    return acc;
  }, {});
}

function mapCloudSiteUsageToLocal(rows) {
  return (rows || []).reduce((acc, row) => {
    if (!row?.date) return acc;
    acc[row.date] = {
      date: row.date,
      sites: row.sites || {},
    };
    return acc;
  }, {});
}

async function syncCurrentDaySiteUsageToCloud(dateKey, sites) {
  try {
    const session = await getSession();
    if (!session) return;
    await saveSiteUsageDay({
      date: dateKey,
      sites,
      distractingMinutes: getDistractingMinutesFromSites(sites),
      focusScore: getFocusScoreFromSites(sites),
    });
  } catch (_) {
    // cloud sync is best effort
  }
}

function getCloudSessionSignature(row) {
  const dateValue =
    row?.date ||
    (row?.created_at ? row.created_at.split("T")[0] : "");
  return [
    dateValue,
    Number(row?.duration) || 0,
    (row?.intent || "").trim(),
    Number.isFinite(row?.start_hour) ? Number(row.start_hour) : -1,
    Number(row?.blocked_attempts) || 0,
    row?.source || "manual",
  ].join("|");
}

function getLocalSessionSignature(entry) {
  return [
    entry?.date || "",
    Number(entry?.duration) || 0,
    (entry?.intent || "").trim(),
    Number.isFinite(entry?.hour) ? Number(entry.hour) : -1,
    Number(entry?.blockedAttempts) || 0,
    entry?.source || "manual",
  ].join("|");
}

async function syncLocalStateToCloud() {
  const session = await getSession();
  if (!session) return false;

  try {
    const local = await chrome.storage.local.get([
      "customBlockedDomains",
      "autoKillEnabled",
      "autoKillMinutes",
      "autoKillSites",
      "dashboardTheme",
      "totalSessions",
      "totalFocusMinutes",
      "currentStreak",
      "longestStreak",
      "dailySessions",
      SESSION_LOG_KEY,
      SITE_USAGE_KEY,
    ]);

    const [settings, cloudHistoryRows] = await Promise.all([
      loadCloudSettings(),
      getSessionHistory(3650),
    ]);

    const customBlockedDomains =
      Array.isArray(local.customBlockedDomains) && local.customBlockedDomains.length
        ? local.customBlockedDomains
        : settings?.custom_blocked_domains || [];
    const autoKillSites =
      local.autoKillSites && Object.keys(local.autoKillSites).length
        ? local.autoKillSites
        : settings?.auto_kill_sites || {};
    const autoKillEnabled =
      typeof local.autoKillEnabled === "boolean"
        ? local.autoKillEnabled
        : !!settings?.auto_kill_enabled;
    const autoKillMinutes =
      Number.isFinite(local.autoKillMinutes) && local.autoKillMinutes > 0
        ? Number(local.autoKillMinutes)
        : Number(settings?.auto_kill_minutes) || 10;
    const dashboardTheme =
      typeof local.dashboardTheme === "string"
        ? local.dashboardTheme
        : settings?.dashboard_theme || "dark";

    await Promise.all([
      saveCustomDomains(customBlockedDomains),
      saveSmartLockConfig({
        enabled: autoKillEnabled,
        minutes: autoKillMinutes,
        sites: autoKillSites,
      }),
      saveDashboardTheme(dashboardTheme),
      syncStats({
        currentStreak: Math.max(
          Number(local.currentStreak) || 0,
          Number(settings?.current_streak) || 0,
        ),
        longestStreak: Math.max(
          Number(local.longestStreak) || 0,
          Number(settings?.longest_streak) || 0,
        ),
        totalSessions: Math.max(
          Number(local.totalSessions) || 0,
          Number(settings?.total_sessions) || 0,
        ),
        totalFocusMinutes: Math.max(
          Number(local.totalFocusMinutes) || 0,
          Number(settings?.total_focus_minutes) || 0,
        ),
      }),
    ]);

    const cloudSignatures = new Set((cloudHistoryRows || []).map(getCloudSessionSignature));
    const localSessions = Array.isArray(local[SESSION_LOG_KEY]) ? local[SESSION_LOG_KEY] : [];
    let syncedSessions = 0;
    for (const entry of localSessions) {
      const duration = Number(entry?.duration) || 0;
      if (duration <= 0) continue;
      const signature = getLocalSessionSignature(entry);
      if (cloudSignatures.has(signature)) continue;

      await saveSession({
        date: entry.date || getTodayKey(),
        duration,
        intent: entry.intent || "",
        completed: entry.completed !== false,
        blockedAttempts: Number(entry.blockedAttempts) || 0,
        energyLevel: entry.energyLevel || null,
        source: entry.source || "manual",
        startHour:
          Number.isFinite(entry.hour) && entry.hour >= 0 ? Number(entry.hour) : null,
        scheduledSessionId: entry.scheduledSessionId || null,
        blockedDomainsSnapshot: Array.isArray(entry.blockedDomainsSnapshot)
          ? entry.blockedDomainsSnapshot
          : [],
      });
      cloudSignatures.add(signature);
      syncedSessions += 1;
    }

    const dayMap = local.dailySessions || {};
    const logEntries = localSessions;
    let syncedDays = 0;
    for (const [dateKey, focusMinutes] of Object.entries(dayMap)) {
      const dayEntries = logEntries.filter((entry) => entry.date === dateKey);
      await saveDailyStats({
        date: dateKey,
        focusMinutes: Number(focusMinutes) || 0,
        sessionsCount: dayEntries.length,
        blockedAttempts: dayEntries.reduce(
          (sum, entry) => sum + (Number(entry.blockedAttempts) || 0),
          0,
        ),
        completedSessions: dayEntries.filter((entry) => entry.completed !== false).length,
        topFocusHour: getTopFocusHourFromLog(dayEntries, dateKey),
      });
      syncedDays += 1;
    }

    const usageMap = local[SITE_USAGE_KEY] || {};
    let syncedUsageDays = 0;
    for (const [dateKey, day] of Object.entries(usageMap)) {
      const sites = day?.sites || {};
      if (!Object.keys(sites).length) continue;
      await saveSiteUsageDay({
        date: dateKey,
        sites,
        distractingMinutes: getDistractingMinutesFromSites(sites),
        focusScore: getFocusScoreFromSites(sites),
      });
      syncedUsageDays += 1;
    }

    console.log(
      "[DeepLock] Local-to-cloud sync complete:",
      JSON.stringify({
        sessions: syncedSessions,
        dailyStats: syncedDays,
        siteUsageDays: syncedUsageDays,
      }),
    );

    return true;
  } catch (error) {
    console.log("[DeepLock] Local-to-cloud sync skipped:", error?.message || error);
    return false;
  }
}

async function hydrateCloudStateToLocal() {
  const session = await getSession();
  if (!session) return false;

  try {
    const [settings, historyRows, dailyRows, usageRows, schedules] = await Promise.all([
      loadCloudSettings(),
      getSessionHistory(365),
      getDailyStats(365),
      getSiteUsage(365),
      getSchedules(),
    ]);

    const updates = {};
    if (settings) {
      const sub = getSubscriptionStateFromSettings(settings);
      if (Array.isArray(settings.custom_blocked_domains)) {
        updates.customBlockedDomains = settings.custom_blocked_domains;
      }
      if (typeof settings.auto_kill_enabled === "boolean") {
        updates.autoKillEnabled = settings.auto_kill_enabled;
      }
      if (Number.isFinite(settings.auto_kill_minutes)) {
        updates.autoKillMinutes = settings.auto_kill_minutes;
      }
      if (settings.auto_kill_sites && typeof settings.auto_kill_sites === "object") {
        updates.autoKillSites = settings.auto_kill_sites;
      }
      if (typeof settings.dashboard_theme === "string") {
        updates.dashboardTheme = settings.dashboard_theme;
      }
      updates.isPro = !!sub.isPro;
      updates.subscriptionPlan = sub.plan || "free";
      updates.subscriptionStatus = sub.status || "inactive";
      updates.subscriptionSource = sub.source || "";
      updates.subscriptionRenewsAt = sub.renewsAt || null;
      updates.lemonsqueezyCustomerId = sub.customerId || null;
      updates.lemonsqueezySubscriptionId = sub.subscriptionId || null;
      if (Number.isFinite(settings.current_streak)) {
        updates.currentStreak = settings.current_streak;
      }
      if (Number.isFinite(settings.longest_streak)) {
        updates.longestStreak = settings.longest_streak;
      }
      if (Number.isFinite(settings.total_sessions)) {
        updates.totalSessions = settings.total_sessions;
      }
      if (Number.isFinite(settings.total_focus_minutes)) {
        updates.totalFocusMinutes = settings.total_focus_minutes;
      }
    }

    if (Array.isArray(dailyRows) && dailyRows.length) {
      updates.dailySessions = mapCloudDailyStatsToLocal(dailyRows);
    }

    if (Array.isArray(historyRows) && historyRows.length) {
      updates[SESSION_LOG_KEY] = mapCloudHistoryToLocal(historyRows);
      const todayKey = getTodayKey();
      const todayRows = historyRows.filter((row) => row.date === todayKey);
      updates.todayDate = todayKey;
      updates.todaySessionCount = todayRows.length;
      updates.todayBlockedAttempts = todayRows.reduce(
        (sum, row) => sum + (Number(row.blocked_attempts) || 0),
        0,
      );
    }

    if (Array.isArray(usageRows) && usageRows.length) {
      updates[SITE_USAGE_KEY] = mapCloudSiteUsageToLocal(usageRows);
    }

    if (Array.isArray(schedules) && schedules.length) {
      updates.schedules = schedules.map((schedule) => {
        const scheduledMs = new Date(
          schedule.scheduled_at || schedule.scheduledAt,
        ).getTime();
        return {
          ...schedule,
          scheduledAt:
            toLocalScheduleValue(
              new Date(schedule.scheduled_at || schedule.scheduledAt),
            ) || schedule.scheduled_at || schedule.scheduledAt,
          scheduledMs,
          synced: true,
        };
      });
    }

    if (Object.keys(updates).length) {
      await chrome.storage.local.set(updates);
    }

    if (Array.isArray(updates.schedules)) {
      updates.schedules.forEach((schedule) => {
        const fireTime = Number(schedule.scheduledMs) || 0;
        if (fireTime > Date.now()) {
          chrome.alarms.create(`schedule_${schedule.id}`, { when: fireTime });
        }
      });
    }
    return true;
  } catch (error) {
    console.log("[DeepLock] Cloud hydrate skipped:", error?.message || error);
    return false;
  }
}

function normalizeTrackedDomain(url) {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return parsed.hostname.toLowerCase().replace(/^www\./, "");
  } catch (_) {
    return null;
  }
}

async function addSiteUsage(domain, elapsedMs) {
  if (!domain || !elapsedMs || elapsedMs < 5000) return;

  const elapsedMinutes = elapsedMs / 60000;
  const today = getTodayKey();
  const data = await chrome.storage.local.get([SITE_USAGE_KEY]);
  const siteUsage = data[SITE_USAGE_KEY] || {};
  const todayUsage = siteUsage[today] || { date: today, sites: {} };

  todayUsage.sites[domain] = (todayUsage.sites[domain] || 0) + elapsedMinutes;
  siteUsage[today] = todayUsage;

  await chrome.storage.local.set({ [SITE_USAGE_KEY]: siteUsage });
  await syncCurrentDaySiteUsageToCloud(today, todayUsage.sites);
}

async function flushTrackedSiteUsage() {
  const data = await chrome.storage.local.get([SITE_USAGE_TRACKING_KEY]);
  const state = data[SITE_USAGE_TRACKING_KEY];
  if (!state?.domain || !state.startedAt) return;

  const elapsedMs = Math.max(0, Date.now() - state.startedAt);
  await addSiteUsage(state.domain, elapsedMs);
  await chrome.storage.local.remove(SITE_USAGE_TRACKING_KEY);
}

async function setTrackedSiteState(domain, tabId, windowId) {
  if (!domain) {
    await chrome.storage.local.remove(SITE_USAGE_TRACKING_KEY);
    return;
  }

  await chrome.storage.local.set({
    [SITE_USAGE_TRACKING_KEY]: {
      domain,
      tabId: tabId ?? null,
      windowId: windowId ?? null,
      startedAt: Date.now(),
    },
  });
}

function queryActiveTab(queryInfo = {}) {
  return new Promise((resolve) => {
    chrome.tabs.query(
      { active: true, lastFocusedWindow: true, ...queryInfo },
      (tabs) => resolve(tabs?.[0] || null),
    );
  });
}

async function trackActiveTab(tab) {
  const domain = normalizeTrackedDomain(tab?.url);
  await flushTrackedSiteUsage();
  await setTrackedSiteState(domain, tab?.id, tab?.windowId);
  await maybeTrackAutoKill(tab);
}

async function refreshUsageTracking(queryInfo = {}) {
  try {
    const tab = await queryActiveTab(queryInfo);
    await trackActiveTab(tab);
  } catch (_) {
    await flushTrackedSiteUsage().catch(() => {});
    clearAutoKillTimer();
  }
}

function bindSiteUsageTracking() {
  chrome.tabs.onActivated.addListener((activeInfo) => {
    refreshUsageTracking({ windowId: activeInfo.windowId });
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!tab?.active) return;
    if (!changeInfo.url && changeInfo.status !== "complete") return;
    trackActiveTab(tab);
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    chrome.storage.local.get([SITE_USAGE_TRACKING_KEY], (data) => {
      if (data[SITE_USAGE_TRACKING_KEY]?.tabId !== tabId) return;
      refreshUsageTracking();
    });
  });

  chrome.windows.onFocusChanged.addListener((windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
      flushTrackedSiteUsage();
      clearAutoKillTimer();
      return;
    }
    refreshUsageTracking({ windowId });
  });

  chrome.windows.onRemoved.addListener((windowId) => {
    if (windowId !== autoKillPopupWindowId) return;
    autoKillPopupWindowId = null;
    autoKillPopupOpen = false;
    autoKillStartTime = Date.now();
    chrome.storage.local.get([AUTO_KILL_STATE_KEY], (data) => {
      const state = data[AUTO_KILL_STATE_KEY];
      if (!state?.domain || !autoKillTriggerMinutes) return;
      chrome.storage.local.set({
        [AUTO_KILL_STATE_KEY]: {
          ...state,
          startedAt: autoKillStartTime,
          minutes: autoKillTriggerMinutes,
        },
      });
      chrome.alarms.create(AUTO_KILL_ALARM, {
        when: autoKillStartTime + autoKillTriggerMinutes * 60 * 1000,
      });
    });
  });
}

async function handleAutoKillAlarm() {
  const data = await chrome.storage.local.get([AUTO_KILL_STATE_KEY, "autoKillEnabled"]);
  const state = data[AUTO_KILL_STATE_KEY];
  if (!data.autoKillEnabled || !state?.domain || !state?.startedAt || !state?.minutes) {
    clearAutoKillTimer();
    return;
  }

  const activeTab = await queryActiveTab(
    state.windowId !== null && state.windowId !== undefined
      ? { windowId: state.windowId }
      : {},
  );
  const activeDomain = normalizeTrackedDomain(activeTab?.url);

  if (!activeDomain || activeDomain !== state.domain) {
    clearAutoKillTimer();
    return;
  }

  const elapsed = Date.now() - state.startedAt;
  if (elapsed < state.minutes * 60 * 1000) {
    chrome.alarms.create(AUTO_KILL_ALARM, {
      when: state.startedAt + state.minutes * 60 * 1000,
    });
    return;
  }

  autoKillCurrentDomain = state.domain;
  autoKillStartTime = state.startedAt;
  autoKillTriggerMinutes = state.minutes;
  clearAutoKillTimer(false);
  await triggerKillSwitch(state.domain, state.minutes);
}

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
      // Verify this key is for DeepLock specifically (not a key from another product)
      const productId = data.meta?.product_id?.toString() || "";
      if (productId && productId !== LS_PRODUCT_ID.toString()) {
        return { success: false, error: "This key is not valid for DeepLock." };
      }

      await chrome.storage.local.set({
        isPro: true,
        licenseKey,
        licenseInstanceId: data.instance?.id || null,
        licenseValidatedAt: Date.now(),
      });
      saveLegacyLicenseEntitlement().catch(() => {});
      return { success: true };
    } else {
      // Key exists but activation limit reached (already on max devices)
      // DO NOT grant Pro — this is the key-sharing attack vector
      // Instead, tell the user to deactivate on another device or buy a new key
      const status = data.license_key?.status;

      if (status === "active") {
        // Key is real but instance limit hit — help user, don't grant for free
        return {
          success: false,
          error:
            "Key already activated on another device. Deactivate it first at lemonsqueezy.com, or use a different key.",
        };
      }

      if (status === "expired") {
        return { success: false, error: "This license key has expired." };
      }

      if (status === "disabled") {
        return { success: false, error: "This license key has been disabled." };
      }

      return {
        success: false,
        error: data.error || "Invalid license key. Check and try again.",
      };
    }
  } catch (e) {
    return {
      success: false,
      error: "Network error. Check your connection and try again.",
    };
  }
}

// Called on every popup open AND on every startBlock — server always overrides local storage
async function validateLegacyLicenseKey() {
  const data = await chrome.storage.local.get([
    "licenseKey",
    "licenseInstanceId",
    "licenseValidatedAt",
  ]);

  // No key stored → definitely not Pro
  if (!data.licenseKey) {
    await chrome.storage.local.set({ isPro: false });
    return { isPro: false };
  }

  // No instanceId → key was never properly activated through LS server
  // Catches: someone who manually set licenseKey without going through activateLicenseKey()
  if (!data.licenseInstanceId) {
    await chrome.storage.local.set({ isPro: false });
    return { isPro: false };
  }

  try {
    const res = await fetch(`${LS_API}/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        license_key: data.licenseKey,
        instance_id: data.licenseInstanceId,
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
    // Network genuinely offline — trust local cache for up to 3 days (not 7)
    // Shorter window = smaller attack surface for the offline bypass
    const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
    const lastValidated = data.licenseValidatedAt || 0;
    const useCached = Date.now() - lastValidated < THREE_DAYS;

    if (!useCached) {
      // Cache expired — force re-validation next time online
      await chrome.storage.local.set({ isPro: false });
      return { isPro: false };
    }

    const cached = await chrome.storage.local.get(["isPro"]);
    return { isPro: !!cached.isPro };
  }
}

// ================================
// MESSAGE HANDLER
// ================================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "startBlock") {
    const { lockEndTime, duration, intent, pinHash, energyLevel, selectedBlockedDomains } = msg;

    // ── SECURITY: Always validate Pro status live against Lemon Squeezy ──
    // NEVER trust isPro from chrome.storage.local — it's writable by anyone
    // with DevTools. validateLicenseKey() hits the LS server every time.
    // Falls back to 7-day cache ONLY if network is genuinely offline.
    validateEntitlement().then((validation) => {
      const isProVerified = validation.isPro;

      chrome.storage.local.get(
        [
          "customBlockedDomains",
          "todaySessionCount",
          "todayDate",
          "todayBlockedAttempts",
          "autoKillReturnTabId",
        ],
        (data) => {
          const today = new Date().toISOString().split("T")[0];
          const isSameDay = data.todayDate === today;
          const todayCount = isSameDay ? data.todaySessionCount || 0 : 0;
          const todayBlockedAttempts = isSameDay ? data.todayBlockedAttempts || 0 : 0;

          // Limit check uses server-verified Pro status — not local storage
          if (!isProVerified && todayCount >= FREE_SESSION_LIMIT) {
            sendResponse({ status: "limit_reached", sessionsUsed: todayCount });
            return;
          }

          // Custom domains only for verified Pro users
          const selectedDomains =
            Array.isArray(selectedBlockedDomains) && selectedBlockedDomains.length
              ? selectedBlockedDomains
              : null;

          const domains =
            selectedDomains ||
            (isProVerified && data.customBlockedDomains?.length
              ? data.customBlockedDomains
              : DEFAULT_BLOCKED_DOMAINS);

          chrome.storage.local.set({
            isLocked: true,
            lockEndTime,
            sessionDuration: duration,
            focusIntent: intent,
            sessionEnergyLevel: energyLevel || null,
            sessionStartTime: Date.now(),
            blockedDomains: domains,
            lastFocusTime: Date.now(),
            todaySessionCount: todayCount + 1,
            todayDate: today,
            todayBlockedAttempts,
            sessionPinHash: pinHash || null,
            sessionBlockedAttempts: 0,
            isPro: isProVerified, // write back server-verified value — overwrites any tampering
          });
          isSessionActive = true;

          enableBlocking(domains);
          const autoKillReturnTabId = data.autoKillReturnTabId;
          if (autoKillReturnTabId) {
            chrome.tabs.reload(autoKillReturnTabId, {}, () => {
              void chrome.runtime.lastError;
              chrome.tabs.update(autoKillReturnTabId, { active: true }, () => {
                void chrome.runtime.lastError;
              });
            });
            chrome.storage.local.remove("autoKillReturnTabId");
          }
          chrome.alarms.create(UNLOCK_ALARM, { when: lockEndTime });
          setupHardMode();

          sendResponse({ status: "ok", sessionsUsed: todayCount + 1 });
        },
      );
    });
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
    validateEntitlement().then((result) => {
      sendResponse(result);
    });
    return true;
  }

  if (msg.action === "openPayment") {
    // ⚠️  YOUR LEMON SQUEEZY CHECKOUT URL
    // Replace with the URL from: lemonsqueezy.com → Your Store → Products → DeepLock Pro → Share
    // Format: https://YOUR-STORE.lemonsqueezy.com/checkout/buy/PRODUCT-UUID
    chrome.storage.local.get(["sbUserId", "sbEmail"], (data) => {
      const checkoutUrl = buildCheckoutUrl(LS_CHECKOUT_URL, {
        userId: data.sbUserId,
        email: data.sbEmail,
      });
      chrome.tabs.create({ url: checkoutUrl });
      sendResponse({ status: "ok", checkoutUrl });
    });
    return true;
  }

  if (msg.action === "incrementBlocked") {
    chrome.storage.local.get(
      ["blockedAttempts", "sessionBlockedAttempts", "todayBlockedAttempts"],
      (data) => {
        chrome.storage.local.set({
          blockedAttempts: (data.blockedAttempts || 0) + 1,
          sessionBlockedAttempts: (data.sessionBlockedAttempts || 0) + 1,
          todayBlockedAttempts: (data.todayBlockedAttempts || 0) + 1,
        });
      },
    );
    sendResponse({ status: "ok" });
    return true;
  }

  if (msg.action === "saveCustomSites") {
    chrome.storage.local.set({ customBlockedDomains: msg.domains });
    saveCustomDomains(msg.domains).catch(() => {});
    sendResponse({ status: "ok" });
    return true;
  }

  if (msg.action === "registerScheduleAlarm") {
    const { schedule } = msg;
    const fireTime =
      schedule.scheduledMs || new Date(schedule.scheduledAt).getTime();
    const msFromNow = fireTime - Date.now();
    console.log(
      `[DeepLock] registerScheduleAlarm: id=${schedule.id} fires in ${Math.round(msFromNow / 1000)}s`,
    );

    // Respond IMMEDIATELY before any async work — prevents port-closed error
    if (fireTime > Date.now()) {
      sendResponse({ status: "ok", fireTime, msFromNow });
      chrome.alarms.create(`schedule_${schedule.id}`, { when: fireTime });
      console.log(
        "[DeepLock] Alarm created for",
        new Date(fireTime).toLocaleString(),
      );
    } else {
      sendResponse({ status: "past", fireTime, msFromNow });
      console.warn(
        "[DeepLock] Alarm time is in the past:",
        schedule.scheduledAt,
      );
    }
    return true;
  }

  if (msg.action === "testScheduleIn65s") {
    const testId = `test_${Date.now()}`;
    const fireTime = Date.now() + 65000;
    const testSched = {
      id: testId,
      intent: "TEST SESSION — 1 minute",
      scheduledAt: new Date(fireTime).toISOString(),
      scheduledMs: fireTime,
      duration: 1,
      repeat: "none",
      active: true,
    };
    // Respond immediately — then do storage work
    sendResponse({
      status: "ok",
      testId,
      firesAt: new Date(fireTime).toLocaleTimeString(),
    });
    chrome.storage.local.get(["schedules"], (data) => {
      const schedules = data.schedules || [];
      schedules.push(testSched);
      chrome.storage.local.set({ schedules }, () => {
        chrome.alarms.create(`schedule_${testId}`, { when: fireTime });
        console.log("[DeepLock] TEST alarm set for 65s, id:", testId);
      });
    });
    return true;
  }

  if (msg.action === "clearScheduleAlarm") {
    chrome.alarms.clear(`schedule_${msg.scheduleId}`);
    sendResponse({ status: "ok" });
    return true;
  }

  // GOOGLE SIGN IN
  if (msg.action === "signIn") {
    signInWithGoogle()
      .then(async (result) => {
        await syncLocalStateToCloud();
        await hydrateCloudStateToLocal();
        sendResponse({ success: true, ...result });
      })
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
      const updates = {};
      if (settings?.custom_blocked_domains?.length) {
        updates.customBlockedDomains = settings.custom_blocked_domains;
      }
      if (typeof settings?.auto_kill_enabled === "boolean") {
        updates.autoKillEnabled = settings.auto_kill_enabled;
      }
      if (Number.isFinite(settings?.auto_kill_minutes)) {
        updates.autoKillMinutes = settings.auto_kill_minutes;
      }
      if (settings?.auto_kill_sites && typeof settings.auto_kill_sites === "object") {
        updates.autoKillSites = settings.auto_kill_sites;
      }
      if (typeof settings?.dashboard_theme === "string") {
        updates.dashboardTheme = settings.dashboard_theme;
      }
      if (Object.keys(updates).length) {
        chrome.storage.local.set(updates);
      }
      sendResponse({ settings });
    });
    return true;
  }

  if (msg.action === "consumeAutoKillIntervention") {
    chrome.storage.local.get(["autoKillIntervention"], (data) => {
      sendResponse({ data: data.autoKillIntervention || null });
    });
    return true;
  }

  if (msg.action === "refreshAutoKillTracking") {
    refreshUsageTracking().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.action === "autoKillLockNow") {
    autoKillPopupOpen = false;
    autoKillPopupWindowId = null;
    clearAutoKillTimer();
    const domain = msg.domain || "the distraction";
    chrome.storage.local.get([AUTO_KILL_STATE_KEY], (data) => {
      const sourceTabId = data[AUTO_KILL_STATE_KEY]?.tabId || null;
      chrome.storage.local.set(
      {
        autoKillIntervention: null,
        autoKillSuggestedIntent: `Leave ${domain} and finish the next important thing`,
        autoKillReturnTabId: sourceTabId,
      },
      () => {
        chrome.windows.create(
          {
            url: chrome.runtime.getURL("popup.html"),
            type: "popup",
            width: 420,
            height: 760,
            focused: true,
          },
          (win) => {
            if (chrome.runtime.lastError || !win?.id) {
              chrome.tabs.create({ url: chrome.runtime.getURL("popup.html"), active: true });
            }
            sendResponse({ ok: true });
          },
        );
      },
    );
    });
    return true;
  }

  if (msg.action === "autoKillContinue") {
    autoKillPopupOpen = false;
    autoKillPopupWindowId = null;
    autoKillStartTime = Date.now();
    chrome.storage.local.get(["ignoredWarnings", AUTO_KILL_STATE_KEY, "autoKillStrictMode", "isPro"], (data) => {
      if (
        data.autoKillStrictMode &&
        (data.isPro || TEMP_BYPASS_STRICT_MODE_PRO_FOR_TESTING)
      ) {
        sendResponse({
          ok: false,
          strictMode: true,
          message: "Strict Mode is enabled. You must lock back in.",
        });
        return;
      }
      const state = data[AUTO_KILL_STATE_KEY];
      if (state?.tabId) {
        chrome.tabs.sendMessage(state.tabId, { action: "hideAutoKillOverlay" }, () => {
          void chrome.runtime.lastError;
        });
      }
      chrome.storage.local.set({
        ignoredWarnings: (data.ignoredWarnings || 0) + 1,
        autoKillIntervention: null,
        [AUTO_KILL_STATE_KEY]: state?.domain
          ? {
              ...state,
              startedAt: autoKillStartTime,
              minutes: autoKillTriggerMinutes || state.minutes || 10,
            }
          : state,
      });
      if (state?.domain) {
        chrome.alarms.create(AUTO_KILL_ALARM, {
          when:
            autoKillStartTime +
            (autoKillTriggerMinutes || state.minutes || 10) * 60 * 1000,
        });
      }
      sendResponse({ ok: true });
    });
    return true;
  }
});

// ================================
// INSTALL
// ================================
// HARD MODE v2 — Multi-layer uninstall prevention
// ================================

let hardModeTabWatcher = null;

function setupHardMode() {
  // Remove any previous watcher to avoid duplicates on re-call
  if (hardModeTabWatcher) {
    chrome.tabs.onUpdated.removeListener(hardModeTabWatcher);
    hardModeTabWatcher = null;
  }

  // ── Layer 1: Tab interception ─────────────────────────────────
  // Chrome does NOT allow redirecting chrome:// URLs via tabs.update.
  // Strategy: when user lands on chrome://extensions, IMMEDIATELY open
  // our hardmode.html as a new active tab covering it — they see our
  // intervention page before they can click "Remove".
  hardModeTabWatcher = function (tabId, changeInfo, tab) {
    if (!tab.url) return;
    if (changeInfo.status !== "complete") return;

    const isExtPage =
      tab.url === "chrome://extensions/" ||
      tab.url === "chrome://extensions" ||
      tab.url.startsWith("chrome://extensions/");
    if (!isExtPage) return;

    chrome.storage.local.get(["isLocked", "lockEndTime"], (d) => {
      if (!d.isLocked || d.lockEndTime <= Date.now()) {
        teardownHardMode();
        return;
      }

      console.log(
        "[DeepLock] Hard mode: intercepted chrome://extensions — opening intervention",
      );

      // Open hardmode page as new active tab — covers the extensions page
      chrome.tabs.create({
        url: chrome.runtime.getURL("hardmode.html"),
        active: true,
      });

      // Notification as additional friction layer
      chrome.notifications.create("hardMode_" + Date.now(), {
        type: "basic",
        iconUrl: "icon128.png",
        title: "\u26a0\ufe0f Session active \u2014 you're still locked in",
        message: `${Math.ceil((d.lockEndTime - Date.now()) / 60000)} min left. Close this and finish.`,
        priority: 2,
      });
    });
  };

  chrome.tabs.onUpdated.addListener(hardModeTabWatcher);
  console.log("[DeepLock] Hard mode ACTIVE \u2014 tab watcher running");

  // ── Layer 2: Nuclear uninstall URL ────────────────────────────
  setNuclearUninstallURL();
}

function teardownHardMode() {
  if (hardModeTabWatcher) {
    chrome.tabs.onUpdated.removeListener(hardModeTabWatcher);
    hardModeTabWatcher = null;
    console.log("[DeepLock] Hard mode watcher removed");
  }
}

function setNuclearUninstallURL() {
  chrome.storage.local.get(
    [
      "currentStreak",
      "totalSessions",
      "totalFocusMinutes",
      "lockEndTime",
      "sessionDuration",
      "sessionStartTime",
    ],
    (data) => {
      const streak = data.currentStreak || 0;
      const sessions = data.totalSessions || 0;
      const totalMins = data.totalFocusMinutes || 0;
      const duration = data.sessionDuration || 60;
      const startTime = data.sessionStartTime || Date.now();
      const elapsed = Math.floor((Date.now() - startTime) / 60000);
      const minsLeft = data.lockEndTime
        ? Math.max(0, Math.ceil((data.lockEndTime - Date.now()) / 60000))
        : 0;

      chrome.storage.local.set({
        uninstallContext: {
          streak,
          sessions,
          totalMins,
          minsLeft,
          elapsed,
          duration,
          capturedAt: Date.now(),
        },
      });

      chrome.runtime.setUninstallURL("", () => {
        void chrome.runtime.lastError;
      });
    },
  );
}

async function validateEntitlement() {
  const session = await getSession();

  if (session) {
    try {
      const settings = await loadCloudSettings();
      const sub = getSubscriptionStateFromSettings(settings || {});
      await chrome.storage.local.set({
        isPro: !!sub.isPro,
        subscriptionPlan: sub.plan || "free",
        subscriptionStatus: sub.status || "inactive",
        subscriptionSource: sub.source || "",
        subscriptionRenewsAt: sub.renewsAt || null,
        lemonsqueezyCustomerId: sub.customerId || null,
        lemonsqueezySubscriptionId: sub.subscriptionId || null,
      });
      if (sub.isPro) return { isPro: true, source: "supabase" };
    } catch (e) {
      console.log("[DeepLock] Supabase entitlement check failed:", e?.message || e);
    }
  }

  const legacy = await validateLegacyLicenseKey();
  return {
    isPro: !!legacy.isPro,
    source: legacy.isPro ? "legacy_license" : "none",
  };
}

// ── Layer 3: Detect mid-session reinstall ──────────────────────
function checkMidSessionQuit() {
  chrome.storage.local.get(
    ["isLocked", "lockEndTime", "sessionStartTime"],
    (data) => {
      if (!data.isLocked) return;
      if (!data.lockEndTime || data.lockEndTime <= Date.now()) return;
      // Extension reinstalled while session was still active in storage
      const elapsed = Math.floor(
        (Date.now() - (data.sessionStartTime || Date.now())) / 60000,
      );
      console.log(
        "[DeepLock] Mid-session reinstall detected. Was",
        elapsed,
        "min in.",
      );
      chrome.storage.local.get(["midSessionQuits"], (d) => {
        const quits = d.midSessionQuits || [];
        quits.push({ time: new Date().toISOString(), elapsedMins: elapsed });
        chrome.storage.local.set({ midSessionQuits: quits, isLocked: false });
      });
    },
  );
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
        todayBlockedAttempts: 0,
        isPro: false,
        todaySessionCount: 0,
        todayDate: new Date().toISOString().split("T")[0],
        installDate: Date.now(),
      });
    }
  });

  checkLockStatus();
  refreshUsageTracking();
});

// ================================
// STARTUP — re-validate on every browser start
// ================================
chrome.runtime.onStartup.addListener(() => {
  checkLockStatus();
  validateEntitlement();
  scheduleSmartAlarms();
  refreshUsageTracking();

  // Re-register any pending scheduled sessions
  chrome.storage.local.get(["schedules"], (data) => {
    const schedules = (data.schedules || []).filter((s) => s.active !== false);
    const now = Date.now();
    schedules.forEach((s) => {
      const fireTime = new Date(s.scheduledAt || s.scheduled_at).getTime();
      if (fireTime > now) {
        chrome.alarms.create(`schedule_${s.id}`, { when: fireTime });
      }
    });
  });

  // Backfill local data to cloud, then hydrate local state from cloud for signed-in users
  chrome.storage.local.get(["sbSignedIn"], (data) => {
    if (data.sbSignedIn) {
      syncLocalStateToCloud()
        .then(() => hydrateCloudStateToLocal())
        .catch(() => {});
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

bindSiteUsageTracking();
refreshUsageTracking();

// ================================
// ALARMS
// ================================
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === UNLOCK_ALARM) unlockSession();
  else if (alarm.name === AUTO_KILL_ALARM) handleAutoKillAlarm();
  else if (alarm.name === REMINDER_ALARM) checkWeeklyInactivity();
  else if (alarm.name === INACTIVITY_ALARM) checkInactivity();
  else if (alarm.name === MORNING_ALARM) checkMorningFocus();
  else if (alarm.name === EVENING_ALARM) checkEveningFocus();
  else if (alarm.name === "weeklyReport") checkWeeklyReport();
  else if (alarm.name.startsWith("schedule_")) fireScheduledSession(alarm.name);
});

// ================================
// SMART NOTIFICATIONS — morning + evening
// Morning: fires at 9am — nudge if 0 sessions started
// Evening: fires at 7pm — nudge if still 0 sessions (missed the whole day)
// ================================
function scheduleSmartAlarms() {
  const now = new Date();
  const hour = now.getHours();
  const today = now.toISOString().split("T")[0];

  function nextOccurrence(targetHour) {
    const t = new Date();
    t.setHours(targetHour, 0, 0, 0);
    // If that time already passed today, schedule for tomorrow
    if (now >= t) t.setDate(t.getDate() + 1);
    return t.getTime();
  }

  // Morning alarm — only create if we haven't fired it today already
  chrome.storage.local.get(["lastMorningFired", "lastEveningFired"], (data) => {
    const morningFiredToday = data.lastMorningFired === today;
    const eveningFiredToday = data.lastEveningFired === today;

    chrome.alarms.get(MORNING_ALARM, (existing) => {
      if (!existing) {
        const when = nextOccurrence(9);
        // If it's before 9am today and we haven't fired yet — schedule for today's 9am
        // If it's after 9am — schedule for tomorrow (nextOccurrence handles this)
        chrome.alarms.create(MORNING_ALARM, {
          when,
          periodInMinutes: 24 * 60,
        });
        console.log(
          "[DeepLock] Morning alarm set for",
          new Date(when).toLocaleString(),
        );
      }
    });

    chrome.alarms.get(EVENING_ALARM, (existing) => {
      if (!existing) {
        const when = nextOccurrence(19);
        chrome.alarms.create(EVENING_ALARM, {
          when,
          periodInMinutes: 24 * 60,
        });
        console.log(
          "[DeepLock] Evening alarm set for",
          new Date(when).toLocaleString(),
        );
      }
    });
  });
}

function checkMorningFocus() {
  const today = new Date().toISOString().split("T")[0];

  // Prevent double-firing on same day (e.g. browser restarted at 9:01am)
  chrome.storage.local.get(["lastMorningFired"], (guard) => {
    if (guard.lastMorningFired === today) {
      console.log(
        "[DeepLock] Morning notification already fired today — skipping",
      );
      return;
    }
    chrome.storage.local.set({ lastMorningFired: today });
    _doMorningNotification(today);
  });
}

function _doMorningNotification(today) {
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

  // Prevent double-firing on same day
  chrome.storage.local.get(["lastEveningFired"], (guard) => {
    if (guard.lastEveningFired === today) {
      console.log(
        "[DeepLock] Evening notification already fired today — skipping",
      );
      return;
    }
    chrome.storage.local.set({ lastEveningFired: today });
    _doEveningNotification(today);
  });
}

function _doEveningNotification(today) {
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
        isSessionActive = true;
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
        console.log("Skipping stale unlock during startup/reload");
        clearSessionRuntime();
        resetStoredSessionState();
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
    return filter.replace("||", "").replace("^", "");
  });

  // Extra domains: alternate TLDs and subdomains requestDomains misses
  const extraDomains = [
    "app.discord.com",
    "discordapp.com",
    "ptab.io",
    "vm.tiktok.com",
    "messenger.com",
    "l.messenger.com",
    "youtu.be",
    "redd.it",
    "t.co",
  ];

  const allTargets = [...new Set([...allDomains, ...extraDomains])];

  // SPECIAL CASE: x.com has a known issue with requestDomains in Chrome
  // (single-character subdomain matching is unreliable for very short domains)
  // Use urlFilter for x.com and twitter.com to guarantee blocking
  const urlFilterDomains = ["x.com", "twitter.com", "t.co"];
  const requestDomainsList = allTargets.filter(
    (d) => !urlFilterDomains.includes(d),
  );

  // requestDomains rules for all normal domains
  requestDomainsList.forEach((domain) => {
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

  // urlFilter rules for x.com / twitter.com — catches x.com/home, twitter.com/*, t.co/*
  urlFilterDomains.forEach((domain) => {
    rules.push({
      id: id++,
      priority: 2, // higher priority than requestDomains rules
      action: {
        type: "redirect",
        redirect: { url: chrome.runtime.getURL("pause.html") },
      },
      condition: {
        urlFilter: `||${domain}^`,
        resourceTypes: ["main_frame"],
      },
    });
    // Also add requestDomains as belt-and-suspenders backup
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
            "rules for",
            allTargets.length,
            "domains",
          );
        }
      },
    );
  });
}

function disableBlocking(callback) {
  chrome.declarativeNetRequest.getDynamicRules((rules) => {
    chrome.declarativeNetRequest.updateDynamicRules(
      { removeRuleIds: rules.map((r) => r.id) },
      () => {
        console.log("[DeepLock] Blocking disabled");
        if (typeof callback === "function") callback();
      },
    );
  });
}

function appendSessionLog(entry) {
  chrome.storage.local.get([SESSION_LOG_KEY], (data) => {
    const sessions = data[SESSION_LOG_KEY] || [];
    sessions.push(entry);
    chrome.storage.local.set({ [SESSION_LOG_KEY]: sessions.slice(-180) });
  });
}

function unlockSession() {
  chrome.storage.local.get(
    ["isLocked", "lockEndTime"],
    (state) => {
      const storageThinksLocked =
        !!state.isLocked || (!!state.lockEndTime && state.lockEndTime > 0);

      if (!isSessionActive && !storageThinksLocked) {
        console.log("No active session — ignoring unlock");
        return;
      }

      isSessionActive = false;
      chrome.storage.local.get(
    [
      "sessionDuration",
      "sessionStartTime",
      "lockEndTime",
      "totalSessions",
      "totalFocusMinutes",
      "currentStreak",
      "longestStreak",
      "dailySessions",
      "lastSessionDate",
      "focusIntent",
      "sessionEnergyLevel",
      "sessionBlockedAttempts",
      "isPro",
      "sbSignedIn",
      "sessionPinHash",
      "scheduledSessionId",
      "blockedDomains",
      SESSION_LOG_KEY,
    ],
    (data) => {
      const duration = data.sessionDuration || 0;
      const sessionStartTime = data.sessionStartTime || null;
      const lockEndTime = data.lockEndTime || null;
      const intent = data.focusIntent || "";
      const energyLevel = data.sessionEnergyLevel || null;
      const sessionBlockedAttempts = data.sessionBlockedAttempts || 0;
      const isPro = !!data.isPro;
      const isSignedIn = !!data.sbSignedIn;
      const scheduledId = data.scheduledSessionId || null;
      const blockedDomainsSnapshot = Array.isArray(data.blockedDomains)
        ? data.blockedDomains
        : [];
      const now = Date.now();
      const elapsedMs =
        sessionStartTime && lockEndTime
          ? Math.max(0, Math.min(now, lockEndTime) - sessionStartTime)
          : duration * 60 * 1000;
      const focusMinutes = Math.max(
        0,
        Math.min(duration, Math.round(elapsedMs / 60000)),
      );

      if (focusMinutes < 5) {
        console.log("Skipping session complete modal — too short");
        console.log("Session ended:", {
          focusMinutes,
          blockedAttempts: sessionBlockedAttempts,
          streak: data.currentStreak || 0,
          intent,
          energyLevel,
        });
        clearSessionRuntime(() => {
          resetStoredSessionState();
        });
        return;
      }

      const totalSessions = (data.totalSessions || 0) + 1;
      const totalFocusMins = (data.totalFocusMinutes || 0) + focusMinutes;

      const today = new Date().toISOString().split("T")[0];
      const dailySessions = data.dailySessions || {};
      dailySessions[today] = (dailySessions[today] || 0) + focusMinutes;

      // ── STREAK LOGIC ──────────────────────────────────
      let currentStreak = data.currentStreak || 0;
      let longestStreak = data.longestStreak || 0;
      const lastDate = data.lastSessionDate;
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = yesterday.toISOString().split("T")[0];

      if (!lastDate) currentStreak = 1;
      else if (lastDate === today) {
        /* same day — keep streak */
      } else if (lastDate === yStr) currentStreak += 1;
      else currentStreak = 1; // gap — reset

      if (currentStreak > longestStreak) longestStreak = currentStreak;

      console.log("Session ended:", {
        focusMinutes,
        blockedAttempts: sessionBlockedAttempts,
        streak: currentStreak,
        intent,
        energyLevel,
      });

      clearSessionRuntime(() => {

      // ── WRITE ALL STATS ───────────────────────────────
      resetStoredSessionState({
        totalSessions,
        totalFocusMinutes: totalFocusMins,
        currentStreak,
        longestStreak,
        dailySessions,
        lastSessionDate: today,
      });
      });

      appendSessionLog({
        completedAt: Date.now(),
        date: today,
        hour: new Date().getHours(),
        duration: focusMinutes,
        energyLevel,
        blockedAttempts: sessionBlockedAttempts,
        intent,
        source: scheduledId ? "scheduled" : "manual",
      });

      const dayEntries = (data[SESSION_LOG_KEY] || []).concat([
        {
          date: today,
          hour: sessionStartTime ? new Date(sessionStartTime).getHours() : new Date().getHours(),
          duration: focusMinutes,
          blockedAttempts: sessionBlockedAttempts,
        },
      ]).filter((entry) => entry.date === today);

      // ── COMPLETION NOTIFICATION ───────────────────────
      chrome.notifications.create(`sessionDone_${Date.now()}`, {
        type: "basic",
        iconUrl: "icon128.png",
        title: "Session Complete 🔥",
        message: `${focusMinutes} min done. Streak: ${currentStreak} day${currentStreak !== 1 ? "s" : ""}. ${intent ? `"${intent.slice(0, 40)}"` : ""}`,
        priority: 2,
        buttons: [{ title: "View dashboard" }],
      });

      // ── SUPABASE SYNC (Pro users) ─────────────────────
      if (isSignedIn) {
        // 1. Save session to history table
        saveSession({
          date: today,
          duration: focusMinutes,
          intent,
          completed: true,
          blockedAttempts: sessionBlockedAttempts,
          energyLevel,
          source: scheduledId ? "scheduled" : "manual",
          startHour: sessionStartTime ? new Date(sessionStartTime).getHours() : new Date().getHours(),
          scheduledSessionId: scheduledId,
          blockedDomainsSnapshot,
        }).catch(() => {});

        // 2. Sync stats (streak etc)
        syncStats({
          currentStreak,
          longestStreak,
          totalSessions,
          totalFocusMinutes: totalFocusMins,
        }).catch(() => {});

        saveDailyStats({
          date: today,
          focusMinutes: dailySessions[today] || 0,
          sessionsCount: dayEntries.length,
          blockedAttempts: dayEntries.reduce(
            (sum, entry) => sum + (Number(entry.blockedAttempts) || 0),
            0,
          ),
          completedSessions: dayEntries.length,
          topFocusHour: getTopFocusHourFromLog(dayEntries, today),
        }).catch(() => {});

        // 4. If this was a scheduled session, mark it used in Supabase
        if (scheduledId) {
          markScheduleUsed(scheduledId).catch(() => {});
        }
      }

      console.log(
        `[DeepLock] Session unlocked. Streak: ${currentStreak}d, Total: ${totalSessions}, Intent: "${intent}"`,
      );
        },
      );
    },
  );
}

// ================================
// SCHEDULED SESSION FIRE
// Called by alarm — auto-starts blocking
// ================================
function fireScheduledSession(alarmName) {
  const schedId = alarmName.replace("schedule_", "");
  console.log("[DeepLock] Firing scheduled session:", schedId);

  chrome.storage.local.get(
    [
      "schedules",
      "isLocked",
      "isPro",
      "customBlockedDomains",
      "todaySessionCount",
      "todayDate",
      "totalSessions",
      "totalFocusMinutes",
      "currentStreak",
      "longestStreak",
      "dailySessions",
      "lastSessionDate",
    ],
    (data) => {
      // Don't interrupt an active session
      if (data.isLocked) {
        console.log("[DeepLock] Scheduled session skipped — already locked");
        return;
      }

      const schedules = data.schedules || [];
      const sched = schedules.find((s) => s.id === schedId);
      if (!sched) {
        console.log("[DeepLock] Schedule not found in storage:", schedId);
        return;
      }

      const duration = sched.duration || 60;
      const intent = sched.intent || "Scheduled focus session";
      const endTime = Date.now() + duration * 60 * 1000;
      const today = new Date().toISOString().split("T")[0];
      const isSameDay = data.todayDate === today;
      const todayCount = isSameDay ? data.todaySessionCount || 0 : 0;

      // Free tier check
      if (!data.isPro && todayCount >= FREE_SESSION_LIMIT) {
        chrome.notifications.create("schedLimitHit", {
          type: "basic",
          iconUrl: "icon128.png",
          title: "Scheduled session blocked",
          message:
            "You've hit today's free limit. Upgrade to Pro for unlimited scheduled sessions.",
          priority: 2,
        });
        return;
      }

      const scheduleSnapshot = Array.isArray(sched.blockedDomainsSnapshot)
        ? sched.blockedDomainsSnapshot
        : [];
      const domains =
        sched.siteMode === "custom" && scheduleSnapshot.length
          ? scheduleSnapshot
          : data.isPro && data.customBlockedDomains?.length
            ? data.customBlockedDomains
            : DEFAULT_BLOCKED_DOMAINS;

      // ── WRITE FULL SESSION STATE ─────────────────────────
      chrome.storage.local.set(
        {
          isLocked: true,
          lockEndTime: endTime,
          sessionDuration: duration,
          focusIntent: intent, // ← write intent NOW so unlockSession reads it correctly
          sessionStartTime: Date.now(),
          blockedDomains: domains,
          lastFocusTime: Date.now(),
          todaySessionCount: todayCount + 1,
          todayDate: today,
          sessionPinHash: null, // scheduled sessions have no PIN
          scheduledSessionId: schedId, // track which schedule fired this
        },
        () => {
          isSessionActive = true;
          enableBlocking(domains);
          chrome.alarms.create(UNLOCK_ALARM, { when: endTime });

          // ── NOTIFICATION ─────────────────────────────────
          chrome.notifications.create(`scheduledStart_${schedId}`, {
            type: "basic",
            iconUrl: "icon128.png",
            title: "🔒 Focus session started",
            message: `${intent} — ${duration} min. Sites are now blocked.`,
            priority: 2,
            buttons: [{ title: "View session" }],
          });

          console.log(
            "[DeepLock] Scheduled session started:",
            intent,
            duration + "min",
          );
        },
      );

      // ── HANDLE REPEAT ────────────────────────────────────
      handleScheduleRepeat(sched, schedules);
    },
  );
}

function handleScheduleRepeat(sched, allSchedules) {
  const repeat = sched.repeat || "none";
  const schedId = sched.id;

  if (repeat === "none") {
    // One-time: mark inactive
    const updated = allSchedules.map((s) =>
      s.id === schedId ? { ...s, active: false } : s,
    );
    chrome.storage.local.set({ schedules: updated });
    // Mark in Supabase
    markScheduleUsed(schedId).catch(() => {});
    return;
  }

  // Repeating: calculate next fire time
  const current = new Date(sched.scheduledAt || sched.scheduled_at);
  let next = new Date(current);

  if (repeat === "daily") {
    next.setDate(next.getDate() + 1);
  } else if (repeat === "weekdays") {
    do {
      next.setDate(next.getDate() + 1);
    } while ([0, 6].includes(next.getDay()));
  } else if (repeat === "weekends") {
    do {
      next.setDate(next.getDate() + 1);
    } while (![0, 6].includes(next.getDay()));
  } else if (repeat === "weekly") {
    next.setDate(next.getDate() + 7);
  }

  const newSched = {
    ...sched,
    scheduledAt: toLocalScheduleValue(next),
    scheduledMs: next.getTime(),
    id: `sched_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  };

  // Update local schedules — remove old, add new
  const updated = allSchedules.filter((s) => s.id !== schedId).concat(newSched);
  chrome.storage.local.set({ schedules: updated });

  // Register new alarm
  chrome.alarms.create(`schedule_${newSched.id}`, { when: next.getTime() });

  // Sync to Supabase
  saveSchedule({
    ...newSched,
    scheduledAt: new Date(newSched.scheduledMs).toISOString(),
  }).catch(() => {});
  markScheduleUsed(schedId).catch(() => {});
}

function toLocalScheduleValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
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
