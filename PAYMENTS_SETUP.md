# DeepLock Payments Setup

This project now uses a server-backed license flow for legacy license keys.

## What changed

- The extension no longer activates or validates Lemon Squeezy licenses directly.
- `supabase/functions/license-entitlement/index.ts` is now the trusted server path for:
  - license activation
  - license validation
  - license deactivation
- The extension caches the result locally, but premium access is decided by the server-backed entitlement response.
- `dashboard.js` no longer contains the temporary Pro bootstrap bypass.
- `server.js` is now only a safe local helper and is not part of production billing.

## Required Supabase Edge Function env vars

Set these before deploying:

```bash
PROJECT_URL=https://YOUR_PROJECT.supabase.co
SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
LEMON_SQUEEZY_PRODUCT_ID=YOUR_DEEPLOCK_PRODUCT_ID
LEMON_SQUEEZY_WEBHOOK_SECRET=YOUR_WEBHOOK_SECRET
```

Notes:

- `LEMON_SQUEEZY_PRODUCT_ID` is used to reject keys from the wrong product.
- `LEMON_SQUEEZY_WEBHOOK_SECRET` is still used by `lemonsqueezy-webhook`.

## Deploy

Deploy both functions:

```bash
supabase functions deploy license-entitlement
supabase functions deploy lemonsqueezy-webhook
```

## Runtime flow

### License activation

1. User pastes a license key into DeepLock.
2. `background.js` sends the key to the `license-entitlement` edge function.
3. The edge function calls Lemon Squeezy.
4. If valid, the extension stores:
   - `licenseKey`
   - `licenseInstanceId`
   - `licenseValidatedAt`
   - server-returned entitlement state

### License validation

1. On premium checks, the extension first checks signed-in Supabase entitlement state.
2. If that is not enough, it calls `license-entitlement` with the saved key and instance ID.
3. If the server confirms the license, Pro stays enabled.
4. If validation fails, Pro is removed locally.
5. If the user is offline, the extension only trusts a short local cache window.

## Supabase sync behavior

When the user is signed in, the edge function also mirrors legacy license state into:

- `chomeExstensionSettings`
  - `plan`
  - `subscription_status`
  - `subscription_source`
  - `subscription_renews_at`
  - `is_pro`
  - `updated_at`
- `chomeExstensionProfiles`
  - `license_key`

That keeps Supabase as the account-level source of truth for signed-in users.

## Production notes

- Do not put Supabase service role keys inside extension files.
- Do not re-enable any temporary dashboard/bootstrap bypass.
- Keep `license-entitlement` as the only path that talks to Lemon Squeezy for license verification.
- If you want even stricter recovery and cross-device restore later, the next step is to require sign-in before license restore so every license is account-bound in Supabase.
