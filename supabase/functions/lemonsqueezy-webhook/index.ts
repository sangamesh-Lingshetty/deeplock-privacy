import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("PROJECT_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") || "";
const LEMON_SQUEEZY_WEBHOOK_SECRET =
  Deno.env.get("LEMON_SQUEEZY_WEBHOOK_SECRET") || "";

const enc = new TextEncoder();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function safeEqualHex(a: string, b: string) {
  const left = (a || "").trim().toLowerCase();
  const right = (b || "").trim().toLowerCase();
  if (!left || !right || left.length !== right.length) return false;

  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) {
    mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return mismatch === 0;
}

async function signPayload(payload: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function isActiveSubscription(status: string) {
  return ["active", "trialing", "on_trial", "paused", "grace_period"].includes(
    status,
  );
}

function getCustomUserId(payload: any) {
  return (
    payload?.meta?.custom_data?.user_id ||
    payload?.meta?.custom_data?.userId ||
    payload?.data?.attributes?.custom_data?.user_id ||
    payload?.data?.attributes?.custom_data?.userId ||
    null
  );
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ ok: true, message: "Use POST for Lemon Squeezy webhooks." });
  }

  if (
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY ||
    !LEMON_SQUEEZY_WEBHOOK_SECRET
  ) {
    return json(
      {
        ok: false,
        error:
          "Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or LEMON_SQUEEZY_WEBHOOK_SECRET.",
      },
      500,
    );
  }

  const rawBody = await req.text();
  const signature = req.headers.get("X-Signature") || "";
  const expected = await signPayload(rawBody, LEMON_SQUEEZY_WEBHOOK_SECRET);

  if (!safeEqualHex(signature, expected)) {
    return json({ ok: false, error: "Invalid webhook signature." }, 401);
  }

  const payload = JSON.parse(rawBody);
  const eventName = String(payload?.meta?.event_name || "").toLowerCase();
  const attributes = payload?.data?.attributes || {};
  const userId = getCustomUserId(payload);

  if (!userId) {
    return json(
      {
        ok: false,
        error:
          "Missing checkout custom_data.user_id. Pass checkout[custom][user_id] in the Lemon Squeezy checkout URL.",
      },
      400,
    );
  }

  const subscriptionStatus = String(attributes?.status || "").toLowerCase();
  const cancelledEvents = new Set([
    "subscription_cancelled",
    "subscription_expired",
  ]);
  const isPro = cancelledEvents.has(eventName)
    ? false
    : isActiveSubscription(subscriptionStatus);

  const settingsPatch = {
    user_id: userId,
    plan: isPro ? "pro" : "free",
    subscription_status: subscriptionStatus || (isPro ? "active" : "inactive"),
    subscription_source: "lemonsqueezy",
    subscription_renews_at:
      attributes?.renews_at ||
      attributes?.ends_at ||
      attributes?.trial_ends_at ||
      null,
    lemonsqueezy_customer_id: attributes?.customer_id
      ? String(attributes.customer_id)
      : null,
    lemonsqueezy_subscription_id: payload?.data?.id
      ? String(payload.data.id)
      : null,
    is_pro: isPro,
    updated_at: new Date().toISOString(),
  };

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await supabase
    .from("chomeExstensionSettings")
    .upsert(settingsPatch, { onConflict: "user_id" });

  if (error) {
    return json({ ok: false, error: error.message }, 500);
  }

  return json({
    ok: true,
    event: eventName,
    userId,
    isPro,
    subscriptionStatus: settingsPatch.subscription_status,
  });
});
