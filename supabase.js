// ================================
// DEEPLOCK SUPABASE v1.0
// All database calls in one file
// ================================

const SUPABASE_URL = "https://zrunitkoovylywtozxql.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpydW5pdGtvb3Z5bHl3dG96eHFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NTU5MDMsImV4cCI6MjA4NzIzMTkwM30.enI_ZZODk3rOuawEf0sKVa3eudszfc7vbK_avepZJ3o";

const GOOGLE_CLIENT_ID =
  "523486634791-lnhttaq8cob6q42urt60uaouqag4oko6.apps.googleusercontent.com";
// ================================
// GOOGLE SIGN IN
// Uses launchWebAuthFlow — works in Chrome extensions
// ================================
async function signInWithGoogle() {
  const redirectUrl = chrome.identity.getRedirectURL("supabase");

  const authUrl =
    `${SUPABASE_URL}/auth/v1/authorize` +
    `?provider=google` +
    `&redirect_to=${encodeURIComponent(redirectUrl)}`;

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: authUrl, interactive: true },
      async (responseUrl) => {
        if (chrome.runtime.lastError || !responseUrl) {
          reject(
            new Error(chrome.runtime.lastError?.message || "Auth cancelled"),
          );
          return;
        }

        try {
          console.log("[DeepLock] Auth response URL:", responseUrl);
          const url = new URL(responseUrl);

          // Supabase can return tokens in hash OR query params
          const hash = new URLSearchParams(url.hash.replace("#", ""));
          const query = new URLSearchParams(url.search);

          const accessToken =
            hash.get("access_token") || query.get("access_token");
          const refreshToken =
            hash.get("refresh_token") || query.get("refresh_token");
          const errorDesc =
            hash.get("error_description") || query.get("error_description");

          if (errorDesc) {
            reject(new Error(errorDesc));
            return;
          }

          if (accessToken) {
            await finalizeSignIn(accessToken, refreshToken, resolve, reject);
            return;
          }

          // Some Supabase configs return a code instead of token
          const code = hash.get("code") || query.get("code");
          if (code) {
            const tokenRes = await fetch(
              `${SUPABASE_URL}/auth/v1/token?grant_type=pkce`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  apikey: SUPABASE_ANON_KEY,
                },
                body: JSON.stringify({ auth_code: code }),
              },
            );
            const tokenData = await tokenRes.json();
            if (tokenData.access_token) {
              await finalizeSignIn(
                tokenData.access_token,
                tokenData.refresh_token,
                resolve,
                reject,
              );
              return;
            }
          }

          reject(new Error("No token received. URL was: " + responseUrl));
        } catch (e) {
          reject(e);
        }
      },
    );
  });
}

async function finalizeSignIn(accessToken, refreshToken, resolve, reject) {
  try {
    const userRes = await sbFetch("/auth/v1/user", "GET", null, accessToken);
    if (!userRes.ok) throw new Error("Failed to get user info");
    const user = await userRes.json();

    await chrome.storage.local.set({
      sbAccessToken: accessToken,
      sbRefreshToken: refreshToken,
      sbUserId: user.id,
      sbEmail: user.email,
      sbSignedIn: true,
    });

    await upsertProfile(user.id, user.email, accessToken);
    resolve({ userId: user.id, email: user.email, accessToken });
  } catch (e) {
    reject(e);
  }
}

// ================================
// SIGN OUT
// ================================
async function signOut() {
  const { sbAccessToken } = await chrome.storage.local.get(["sbAccessToken"]);
  if (sbAccessToken) {
    await sbFetch("/auth/v1/logout", "POST", null, sbAccessToken).catch(
      () => {},
    );
  }
  await chrome.storage.local.remove([
    "sbAccessToken",
    "sbRefreshToken",
    "sbUserId",
    "sbEmail",
    "sbSignedIn",
  ]);
}

// ================================
// GET CURRENT SESSION
// Returns null if not signed in
// ================================
async function getSession() {
  const data = await chrome.storage.local.get([
    "sbAccessToken",
    "sbUserId",
    "sbEmail",
    "sbSignedIn",
  ]);
  if (!data.sbSignedIn || !data.sbAccessToken) return null;
  return {
    accessToken: data.sbAccessToken,
    userId: data.sbUserId,
    email: data.sbEmail,
  };
}

// ================================
// UPSERT PROFILE
// Creates profile if doesn't exist, updates if does
// ================================
async function upsertProfile(userId, email, accessToken) {
  // Also link license key if they have one
  const { licenseKey } = await chrome.storage.local.get(["licenseKey"]);

  const res = await sbFetch(
    "/rest/v1/chomeExstensionProfiles",
    "POST",
    {
      id: userId,
      email,
      license_key: licenseKey || null,
    },
    accessToken,
    { prefer: "resolution=merge-duplicates" },
  );

  return res.ok;
}

// ================================
// SAVE SESSION
// Called after every completed focus session
// ================================
async function saveSession({
  date,
  duration,
  intent,
  completed,
  blockedAttempts,
  energyLevel,
  source,
  startHour,
  scheduledSessionId,
  blockedDomainsSnapshot,
}) {
  const session = await getSession();
  if (!session) return false; // not signed in, skip silently

  const body = {
    user_id: session.userId,
    date,
    duration,
    intent: intent || "",
    completed: completed ?? true,
    blocked_attempts: Number(blockedAttempts) || 0,
    energy_level:
      Number.isFinite(energyLevel) && energyLevel > 0 ? Number(energyLevel) : null,
    source: source || "manual",
    start_hour:
      Number.isFinite(startHour) && startHour >= 0 ? Number(startHour) : null,
    scheduled_session_id: scheduledSessionId || null,
    blocked_domains_snapshot: Array.isArray(blockedDomainsSnapshot)
      ? blockedDomainsSnapshot
      : [],
  };

  const res = await sbFetch(
    "/rest/v1/chomeExstensionSessions",
    "POST",
    body,
    session.accessToken,
  );

  if (!res.ok) {
    const err = await res.text().catch(() => "unknown");
    console.error("[DeepLock] saveSession FAILED:", res.status, err, body);
    return false;
  }

  return true;
}

async function upsertSettingsPatch(patch) {
  const session = await getSession();
  if (!session) return false;

  const res = await sbFetch(
    "/rest/v1/chomeExstensionSettings",
    "POST",
    {
      user_id: session.userId,
      ...patch,
      updated_at: new Date().toISOString(),
    },
    session.accessToken,
    { prefer: "resolution=merge-duplicates" },
  );

  return res.ok;
}

function getSubscriptionStateFromSettings(settings) {
  const plan = String(settings?.plan || settings?.subscription_plan || "").toLowerCase();
  const status = String(settings?.subscription_status || "").toLowerCase();
  const isPro =
    settings?.is_pro === true ||
    ((plan === "pro" || plan === "premium") &&
      ["active", "trialing", "grace_period", "paused"].includes(status));

  return {
    isPro,
    plan: plan || "free",
    status: status || "inactive",
    source: settings?.subscription_source || "",
    renewsAt: settings?.subscription_renews_at || null,
    customerId: settings?.lemonsqueezy_customer_id || null,
    subscriptionId: settings?.lemonsqueezy_subscription_id || null,
  };
}

// ================================
// SYNC FULL STATS TO SUPABASE
// Called after session completes — pushes streak/session counts
// Does NOT touch custom_blocked_domains — that's saveCustomDomains's job
// ================================
async function syncStats({
  currentStreak,
  longestStreak,
  totalSessions,
  totalFocusMinutes,
}) {
  return upsertSettingsPatch({
    current_streak: currentStreak,
    longest_streak: longestStreak,
    total_sessions: totalSessions,
    total_focus_minutes: totalFocusMinutes,
  });
}

// ================================
// SAVE CUSTOM BLOCKED DOMAINS
// Called when Pro user changes their custom sites
// ================================
async function saveCustomDomains(domains) {
  return upsertSettingsPatch({
    custom_blocked_domains: domains,
  });
}

async function saveSmartLockConfig({ enabled, minutes, sites }) {
  return upsertSettingsPatch({
    auto_kill_enabled: !!enabled,
    auto_kill_minutes: Number(minutes) || 10,
    auto_kill_sites: sites || {},
  });
}

async function saveDashboardTheme(theme) {
  return upsertSettingsPatch({
    dashboard_theme: theme === "light" ? "light" : "dark",
  });
}

// ================================
// LOAD SETTINGS FROM CLOUD
// Called on extension startup — pulls remote settings
// ================================
async function loadCloudSettings() {
  const session = await getSession();
  if (!session) return null;

  const res = await sbFetch(
    `/rest/v1/chomeExstensionSettings?user_id=eq.${session.userId}&select=*`,
    "GET",
    null,
    session.accessToken,
  );

  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

async function validateLicense(licenseKey) {
  const trimmed = String(licenseKey || "").trim();
  if (!trimmed) {
    return { ok: false, error: "Enter a valid license key." };
  }

  try {
    const res = await fetch("https://api.lemonsqueezy.com/v1/licenses/validate", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        license_key: trimmed,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.valid !== true) {
      return {
        ok: false,
        error: data?.error || "Invalid license key.",
      };
    }

    return {
      ok: true,
      licenseKey: trimmed,
      status: data?.license_key?.status || "active",
      raw: data,
    };
  } catch (_) {
    return {
      ok: false,
      error: "License validation failed. Check your internet and try again.",
    };
  }
}

async function saveLicenseToSupabase(userId, licenseKey) {
  const session = await getSession();
  if (!session || !userId) return false;

  const settingsRes = await sbFetch(
    "/rest/v1/chomeExstensionSettings",
    "POST",
    {
      user_id: userId,
      plan: "pro",
      subscription_status: "active",
      subscription_source: "legacy_license",
      is_pro: true,
      updated_at: new Date().toISOString(),
    },
    session.accessToken,
    { prefer: "resolution=merge-duplicates" },
  );

  if (!settingsRes.ok) return false;

  await sbFetch(
    "/rest/v1/chomeExstensionProfiles",
    "POST",
    {
      id: userId,
      email: session.email,
      license_key: licenseKey,
    },
    session.accessToken,
    { prefer: "resolution=merge-duplicates" },
  ).catch(() => {});

  return true;
}

async function getProStatusFromSupabase() {
  const session = await getSession();
  if (!session) {
    return {
      isPro: false,
      plan: "free",
      status: "inactive",
      source: "",
    };
  }

  const settings = await loadCloudSettings();
  const sub = getSubscriptionStateFromSettings(settings || {});
  return {
    isPro: !!sub.isPro,
    plan: sub.plan || "free",
    status: sub.status || "inactive",
    source: sub.source || "",
    renewsAt: sub.renewsAt || null,
  };
}

// ================================
// GET SESSION HISTORY (last 90 days)
// ================================
async function getSessionHistory(days = 90) {
  const session = await getSession();
  if (!session) return [];

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split("T")[0];

  const res = await sbFetch(
    `/rest/v1/chomeExstensionSessions?user_id=eq.${session.userId}&date=gte.${sinceStr}&order=created_at.desc&select=*`,
    "GET",
    null,
    session.accessToken,
  );

  if (!res.ok) return [];
  return await res.json();
}

async function saveDailyStats({
  date,
  focusMinutes,
  sessionsCount,
  blockedAttempts,
  completedSessions,
  topFocusHour,
}) {
  const session = await getSession();
  if (!session) return false;

  const body = {
    user_id: session.userId,
    date,
    focus_minutes: Number(focusMinutes) || 0,
    sessions_count: Number(sessionsCount) || 0,
    blocked_attempts: Number(blockedAttempts) || 0,
    completed_sessions: Number(completedSessions) || 0,
    top_focus_hour:
      Number.isFinite(topFocusHour) && topFocusHour >= 0 ? topFocusHour : null,
    updated_at: new Date().toISOString(),
  };

  const res = await sbFetch(
    "/rest/v1/chomeExstensionDailyStats",
    "POST",
    body,
    session.accessToken,
    { prefer: "resolution=merge-duplicates" },
  );

  if (!res.ok) {
    const err = await res.text().catch(() => "unknown");
    console.error("[DeepLock] saveDailyStats FAILED:", res.status, err, body);
    return false;
  }

  return true;
}

async function getDailyStats(days = 365) {
  const session = await getSession();
  if (!session) return [];

  const since = new Date();
  since.setDate(since.getDate() - Math.max(0, days - 1));
  const sinceStr = since.toISOString().split("T")[0];

  const res = await sbFetch(
    `/rest/v1/chomeExstensionDailyStats?user_id=eq.${session.userId}&date=gte.${sinceStr}&order=date.asc&select=*`,
    "GET",
    null,
    session.accessToken,
  );

  if (!res.ok) {
    const err = await res.text().catch(() => "unknown");
    console.error("[DeepLock] getDailyStats FAILED:", res.status, err);
    return [];
  }
  return await res.json();
}

async function saveSiteUsageDay({ date, sites, distractingMinutes, focusScore }) {
  const session = await getSession();
  if (!session) return false;

  const body = {
    user_id: session.userId,
    date,
    sites: sites || {},
    distracting_minutes: Number(distractingMinutes) || 0,
    focus_score: Number.isFinite(focusScore) ? focusScore : null,
    updated_at: new Date().toISOString(),
  };

  const res = await sbFetch(
    "/rest/v1/chomeExstensionSiteUsage",
    "POST",
    body,
    session.accessToken,
    { prefer: "resolution=merge-duplicates" },
  );

  if (!res.ok) {
    const err = await res.text().catch(() => "unknown");
    console.error("[DeepLock] saveSiteUsageDay FAILED:", res.status, err, body);
    return false;
  }

  return true;
}

async function getSiteUsage(days = 365) {
  const session = await getSession();
  if (!session) return [];

  const since = new Date();
  since.setDate(since.getDate() - Math.max(0, days - 1));
  const sinceStr = since.toISOString().split("T")[0];

  const res = await sbFetch(
    `/rest/v1/chomeExstensionSiteUsage?user_id=eq.${session.userId}&date=gte.${sinceStr}&order=date.asc&select=*`,
    "GET",
    null,
    session.accessToken,
  );

  if (!res.ok) {
    const err = await res.text().catch(() => "unknown");
    console.error("[DeepLock] getSiteUsage FAILED:", res.status, err);
    return [];
  }
  return await res.json();
}

// ================================
// INTERNAL FETCH HELPER
// ================================
async function sbFetch(path, method, body, accessToken, extraHeaders = {}) {
  const headers = {
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY,
    Authorization: accessToken ? `Bearer ${accessToken}` : undefined,
  };

  // Apply extra headers explicitly (Prefer must be capital P)
  if (extraHeaders.prefer) headers["Prefer"] = extraHeaders.prefer;
  if (extraHeaders["Prefer"]) headers["Prefer"] = extraHeaders["Prefer"];

  // Remove undefined values
  Object.keys(headers).forEach(
    (k) => headers[k] === undefined && delete headers[k],
  );

  return fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function invokeEdgeFunction(functionName, body, accessToken) {
  const headers = {
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY,
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body || {}),
  });
}

// ================================
// SCHEDULED SESSIONS
// Table: chomeExstensionSchedules
// Columns: id, user_id, intent, scheduled_at (ISO), duration, repeat, active,
// site_mode, blocked_domains_snapshot
// ================================
async function saveSchedule({
  id,
  intent,
  scheduledAt,
  duration,
  repeat,
  siteMode,
  blockedDomainsSnapshot,
  active,
}) {
  const session = await getSession();
  if (!session) {
    console.warn(
      "[DeepLock] saveSchedule: not signed in — skipping cloud save",
    );
    return { ok: false, reason: "not_signed_in" };
  }

  const body = {
    id: id,
    user_id: session.userId,
    intent: intent || "",
    scheduled_at: scheduledAt, // snake_case — matches DB column
    duration,
    repeat: repeat || "none",
    site_mode: siteMode || "current",
    blocked_domains_snapshot: Array.isArray(blockedDomainsSnapshot)
      ? blockedDomainsSnapshot
      : [],
    active: active !== false,
  };

  console.log("[DeepLock] saveSchedule body:", JSON.stringify(body));

  const res = await sbFetch(
    "/rest/v1/chomeExstensionSchedules",
    "POST",
    body,
    session.accessToken,
    { prefer: "resolution=merge-duplicates,return=minimal" },
  );

  if (!res.ok) {
    const err = await res.text().catch(() => "unknown");
    console.error("[DeepLock] saveSchedule FAILED:", res.status, err);
    return { ok: false, status: res.status, error: err };
  }

  console.log("[DeepLock] saveSchedule SUCCESS:", res.status);
  return { ok: true };
}

async function getSchedules() {
  const session = await getSession();
  if (!session) return null; // caller handles local fallback

  const now = new Date().toISOString();
  const res = await sbFetch(
    `/rest/v1/chomeExstensionSchedules?user_id=eq.${session.userId}&active=eq.true&order=scheduled_at.asc&select=*`,
    "GET",
    null,
    session.accessToken,
  );
  if (!res.ok) return null;
  return await res.json();
}

async function deleteSchedule(id) {
  const session = await getSession();
  if (!session) return false;

  const res = await sbFetch(
    `/rest/v1/chomeExstensionSchedules?id=eq.${id}`,
    "DELETE",
    null,
    session.accessToken,
  );
  return res.ok;
}

async function markScheduleUsed(id) {
  const session = await getSession();
  if (!session) return false;

  const res = await sbFetch(
    `/rest/v1/chomeExstensionSchedules?id=eq.${id}`,
    "PATCH",
    { active: false },
    session.accessToken,
  );
  return res.ok;
}
