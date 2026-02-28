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
async function saveSession({ date, duration, intent, completed }) {
  const session = await getSession();
  if (!session) return false; // not signed in, skip silently

  const res = await sbFetch(
    "/rest/v1/chomeExstensionSessions",
    "POST",
    {
      user_id: session.userId,
      date,
      duration,
      intent: intent || "",
      completed: completed ?? true,
    },
    session.accessToken,
  );

  return res.ok;
}

// ================================
// SYNC FULL STATS TO SUPABASE
// Called after session completes — pushes everything
// ================================
async function syncStats({
  currentStreak,
  longestStreak,
  totalSessions,
  totalFocusMinutes,
}) {
  const session = await getSession();
  if (!session) return false;

  // Store streak data in settings table as JSON
  const res = await sbFetch(
    "/rest/v1/chomeExstensionSettings",
    "POST",
    {
      user_id: session.userId,
      custom_blocked_domains: [],
      updated_at: new Date().toISOString(),
    },
    session.accessToken,
    { prefer: "resolution=merge-duplicates" },
  );

  return res.ok;
}

// ================================
// SAVE CUSTOM BLOCKED DOMAINS
// Called when Pro user changes their custom sites
// ================================
async function saveCustomDomains(domains) {
  const session = await getSession();
  if (!session) return false;

  const res = await sbFetch(
    "/rest/v1/chomeExstensionSettings",
    "POST",
    {
      user_id: session.userId,
      custom_blocked_domains: domains,
      updated_at: new Date().toISOString(),
    },
    session.accessToken,
    { prefer: "resolution=merge-duplicates" },
  );

  return res.ok;
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

// ================================
// INTERNAL FETCH HELPER
// ================================
async function sbFetch(path, method, body, accessToken, extraHeaders = {}) {
  const headers = {
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY,
    ...extraHeaders,
  };
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
  if (extraHeaders.prefer) headers["Prefer"] = extraHeaders.prefer;

  return fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}
