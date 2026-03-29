import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("PROJECT_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") || "";
const LEMON_SQUEEZY_PRODUCT_ID =
  String(Deno.env.get("LEMON_SQUEEZY_PRODUCT_ID") || "").trim();
const LEMON_SQUEEZY_LICENSE_API =
  "https://api.lemonsqueezy.com/v1/licenses";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });
}

function normalizeStatus(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function isActiveLicenseStatus(status: string) {
  return status === "active";
}

function getBearerToken(req: Request) {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  const token = auth.slice(7).trim();
  return token || null;
}

async function postLicense(
  path: "activate" | "validate" | "deactivate",
  payload: Record<string, string>,
) {
  const body = new URLSearchParams();
  Object.entries(payload).forEach(([key, value]) => {
    if (value) body.set(key, value);
  });

  const res = await fetch(`${LEMON_SQUEEZY_LICENSE_API}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  const data = await res.json().catch(() => ({}));
  return { res, data };
}

function buildEntitlement({
  isPro,
  status,
  licenseKey,
  licenseInstanceId,
  source = "legacy_license",
}: {
  isPro: boolean;
  status: string;
  licenseKey?: string | null;
  licenseInstanceId?: string | null;
  source?: string;
}) {
  return {
    isPro,
    plan: isPro ? "pro" : "free",
    status: status || (isPro ? "active" : "inactive"),
    source,
    licenseKey: licenseKey || null,
    licenseInstanceId: licenseInstanceId || null,
    checkedAt: new Date().toISOString(),
  };
}

async function getAuthedUser(supabase: ReturnType<typeof createClient>, req: Request) {
  const token = getBearerToken(req);
  if (!token) return null;

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;

  return {
    id: data.user.id,
    email: data.user.email || null,
  };
}

async function syncLegacyLicenseState(
  supabase: ReturnType<typeof createClient>,
  user: { id: string; email: string | null } | null,
  entitlement: ReturnType<typeof buildEntitlement>,
  licenseKey: string | null,
) {
  if (!user?.id) return;

  const settingsPatch = {
    user_id: user.id,
    plan: entitlement.plan,
    subscription_status: entitlement.status,
    subscription_source: entitlement.source,
    subscription_renews_at: null,
    is_pro: entitlement.isPro,
    updated_at: entitlement.checkedAt,
  };

  const { error: settingsError } = await supabase
    .from("chomeExstensionSettings")
    .upsert(settingsPatch, { onConflict: "user_id" });

  if (settingsError) {
    throw new Error(settingsError.message);
  }

  if (!licenseKey) return;

  const profilePatch = {
    id: user.id,
    email: user.email,
    license_key: licenseKey,
  };

  const { error: profileError } = await supabase
    .from("chomeExstensionProfiles")
    .upsert(profilePatch, { onConflict: "id" });

  if (profileError) {
    throw new Error(profileError.message);
  }
}

function getActivationErrorMessage(data: any) {
  const status = normalizeStatus(data?.license_key?.status);
  if (status === "active") {
    return "Key already activated on another device. Deactivate it first or use a different key.";
  }
  if (status === "expired") {
    return "This license key has expired.";
  }
  if (status === "disabled") {
    return "This license key has been disabled.";
  }
  return data?.error || "Invalid license key. Check and try again.";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return json({ ok: true });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "Use POST for license entitlement." }, 405);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(
      { ok: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY." },
      500,
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body." }, 400);
  }

  const action = String(body?.action || "").trim().toLowerCase();
  const licenseKey = String(body?.licenseKey || "").trim();
  const licenseInstanceId = String(body?.licenseInstanceId || "").trim();
  const deviceId = String(body?.deviceId || "").trim();

  if (!["activate", "validate", "deactivate"].includes(action)) {
    return json({ ok: false, error: "Unsupported license action." }, 400);
  }

  if ((action === "activate" || action === "validate") && !licenseKey) {
    return json({ ok: false, error: "Missing licenseKey." }, 400);
  }

  if ((action === "validate" || action === "deactivate") && !licenseInstanceId) {
    return json({ ok: false, error: "Missing licenseInstanceId." }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const authedUser = await getAuthedUser(supabase, req);

  try {
    if (action === "activate") {
      const { data } = await postLicense("activate", {
        license_key: licenseKey,
        instance_name: `DeepLock-${deviceId || Date.now()}`,
      });

      const productId = String(data?.meta?.product_id || "").trim();
      if (LEMON_SQUEEZY_PRODUCT_ID && productId && productId !== LEMON_SQUEEZY_PRODUCT_ID) {
        return json({ ok: false, error: "This key is not valid for DeepLock." }, 400);
      }

      const status = normalizeStatus(data?.license_key?.status);
      const instanceId = data?.instance?.id ? String(data.instance.id) : null;
      const isPro = data?.activated === true && isActiveLicenseStatus(status);
      const entitlement = buildEntitlement({
        isPro,
        status,
        licenseKey,
        licenseInstanceId: instanceId,
      });

      if (isPro) {
        await syncLegacyLicenseState(supabase, authedUser, entitlement, licenseKey);
        return json({ ok: true, entitlement });
      }

      return json(
        {
          ok: false,
          error: getActivationErrorMessage(data),
          entitlement,
        },
        400,
      );
    }

    if (action === "validate") {
      const { data } = await postLicense("validate", {
        license_key: licenseKey,
        instance_id: licenseInstanceId,
      });

      const productId = String(data?.meta?.product_id || "").trim();
      const status = normalizeStatus(data?.license_key?.status);
      const productMatches =
        !LEMON_SQUEEZY_PRODUCT_ID || !productId || productId === LEMON_SQUEEZY_PRODUCT_ID;
      const isPro =
        data?.valid === true &&
        isActiveLicenseStatus(status) &&
        productMatches;

      const entitlement = buildEntitlement({
        isPro,
        status,
        licenseKey,
        licenseInstanceId,
      });

      await syncLegacyLicenseState(supabase, authedUser, entitlement, licenseKey);
      return json({ ok: true, entitlement });
    }

    const { data } = await postLicense("deactivate", {
      license_key: licenseKey,
      instance_id: licenseInstanceId,
    });
    const status = normalizeStatus(data?.license_key?.status);
    const entitlement = buildEntitlement({
      isPro: false,
      status: status || "inactive",
      licenseKey,
      licenseInstanceId,
    });

    await syncLegacyLicenseState(supabase, authedUser, entitlement, licenseKey || null);
    return json({ ok: true, entitlement });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "License check failed.",
      },
      500,
    );
  }
});
