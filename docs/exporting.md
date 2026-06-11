# Exporting & Scheduled-Delivery Settings

This document describes the organization-level **Exporting** settings (PROD-7217): how scheduled-delivery
download links are configured, how their expiry is resolved per channel, and how the system transparently
chooses between raw S3 presigned URLs and the persistent-download-URL system.

---

## Overview

Scheduled deliveries (email / Slack / Microsoft Teams / Google Chat) attach download links to exported
files (CSV, XLSX, images, PDFs). How long those links stay valid used to be controlled **only** by
instance-wide environment variables, which doesn't work for Pro customers on shared multi-tenant
infrastructure where each org needs its own policy.

The Exporting settings move that control to the **organization level**: an admin sets a base "Download link
expiry" plus optional per-channel overrides, in **Settings → Organization → Exporting**. The env vars become
the fall-back defaults, so nothing breaks for instances that never configure the org settings.

The guiding principle was: **expose the existing env vars as per-org overrides, stay backwards-compatible, and
don't add new business logic** (no artificial expiry caps). The one piece of genuinely new behavior is making
the raw-vs-persistent URL choice automatic ("transparent") so users never have to think about it.

---

## What an admin configures

| Setting                | Stored column                                   | Meaning                                                                 |
|------------------------|-------------------------------------------------|-------------------------------------------------------------------------|
| **Download link expiry** (base) | `scheduled_delivery_expiration_seconds`         | Default lifetime (seconds) for every channel. Resolved to an effective number in the API. |
| **Email** override     | `scheduled_delivery_expiration_seconds_email`   | Optional. `null` ⇒ inherit the base.                                    |
| **Slack** override     | `scheduled_delivery_expiration_seconds_slack`   | Optional. `null` ⇒ inherit the base.                                    |
| **Microsoft Teams** override | `scheduled_delivery_expiration_seconds_msteams` | Optional. `null` ⇒ inherit the base.                              |
| **Google Chat** override | `scheduled_delivery_expiration_seconds_googlechat` | Optional. `null` ⇒ inherit the base. Org-only (no env var).      |

All five live on the `organization_settings` table (one row per org). `null`/absent means "inherit", so an
org with no row behaves exactly like the instance defaults.

Per-channel overrides are surfaced raw in the API (`null` = inherit) so the UI can distinguish "not set" from
an explicit value; the base is surfaced resolved (always an effective number) so the frontend can display it
without knowing the env defaults.

> **Google Chat** has no instance env var (`PERSISTENT_DOWNLOAD_URL_EXPIRATION_SECONDS_*`), so its override is
> org-only and falls back straight to the base (then env base).

The UI only shows a per-channel override for delivery methods the org can actually use — Slack (installed),
Email (`hasEmailClient`), Microsoft Teams (`hasMicrosoftTeams`), Google Chat (`GoogleChatEnabled` flag). A
stored override on a method that later becomes unavailable is preserved, just not shown.

---

## Expiry resolution (per channel)

When a delivery runs, `SchedulerTask.getDeliveryExpirationSeconds(orgUuid, channel)` resolves the effective
expiry with **org overrides winning over env, and channel winning over base**:

```
orgChannel  ??  orgBase  ??  envChannel  ??  envBase
```

- `orgChannel` — e.g. `scheduled_delivery_expiration_seconds_slack`
- `orgBase` — `scheduled_delivery_expiration_seconds`
- `envChannel` — `PERSISTENT_DOWNLOAD_URL_EXPIRATION_SECONDS_{EMAIL,SLACK,MSTEAMS}`
- `envBase` — `PERSISTENT_DOWNLOAD_URL_EXPIRATION_SECONDS` (default 259200 = 3 days)

So an admin setting only the base in the UI overrides any leftover instance per-channel env default — the
admin's explicit org config dominates instance config.

---

## Transparent persistence (raw S3 vs persistent URL)

A raw S3 presigned URL **cannot live longer than 7 days** (AWS SigV4 hard limit). The persistent-download-URL
system sidesteps this: the link is a stable app URL (`/api/v1/file/{nanoid}`) that mints a fresh, short-lived
(5 min) presigned S3 URL on each access, so its logical lifetime is unbounded.

`PersistentDownloadFileService.createPersistentUrl()` is the single decision point. Every scheduled-delivery
download URL (image, CSV, XLSX, pivot) funnels through it. The choice is **derived**, not a user toggle:

```ts
const exceedsS3Limit = expirationSeconds > 604800; // 7 days
const usePersistent = lightdashConfig.persistentDownloadUrls.enabled || exceedsS3Limit;
// usePersistent → persistent app URL
// otherwise     → raw S3 presigned URL, honoring the requested expiry
```

### `PERSISTENT_DOWNLOAD_URLS_ENABLED` behavior

| Expiry        | Env unset (default) | Env `'true'` | Env `'false'`        |
|---------------|---------------------|--------------|----------------------|
| **≤ 7 days**  | raw S3 presigned    | persistent   | raw S3 presigned     |
| **> 7 days**  | persistent (forced) | persistent   | persistent (forced)  |

- **Off by default.** `parseConfig` keeps `enabled = false` unless the var is explicitly `'true'` — unchanged
  from before, so existing instances behave exactly as they did for links ≤ 7 days.
- **> 7 days always wins.** Even when the instance hasn't opted in, a long expiry forces persistence — it's the
  only way the link can live that long. This only happens via the *new* org expiry setting, so there's no
  pre-existing behavior to break (and it fixes the old footgun where a >7-day raw link would just 403).

> **Why keep the default `false`?** An earlier draft flipped the default to `true` (unset ⇒ persistent). But
> most cloud customers already set `PERSISTENT_DOWNLOAD_URLS_ENABLED` explicitly, and a handful rely on the
> default — flipping it would have silently switched those (and all unset self-hosted instances) from direct
> S3 links to app-routed persistent links for *every* download, not just deliveries. Keeping the default `false`
> and only escalating on >7-day expiry achieves the goal with zero behavioral change to existing setups.

This keeps the change fully backwards-compatible: the only new behavior is the >7-day escalation, which is
reachable only through the new settings.

---

## Environment variables (now defaults, not the only control)

| Env var                                          | Default            | Role after this change                                  |
|--------------------------------------------------|--------------------|---------------------------------------------------------|
| `PERSISTENT_DOWNLOAD_URL_EXPIRATION_SECONDS`     | 259200 (3 days)    | Base expiry default (org base overrides it)             |
| `PERSISTENT_DOWNLOAD_URL_EXPIRATION_SECONDS_EMAIL`   | unset          | Email default (org email/base overrides it)             |
| `PERSISTENT_DOWNLOAD_URL_EXPIRATION_SECONDS_SLACK`   | unset          | Slack default                                           |
| `PERSISTENT_DOWNLOAD_URL_EXPIRATION_SECONDS_MSTEAMS` | unset          | MS Teams default                                        |
| `PERSISTENT_DOWNLOAD_URLS_ENABLED`               | `false`            | Whether to use persistent URLs for links ≤ 7 days (>7 days always persistent) |
| `S3_EXPIRATION_TIME`                             | 259200 (3 days)    | Generic S3 presigned expiry for *non-delivery* file ops |

### Why `S3_EXPIRATION_TIME` is not an org setting

It governs **all** server-side S3 presigned URLs (app-image uploads, result-cache presigns, …) at the
org-agnostic `S3Client` layer, so exposing it per-org would require making `S3Client` org-aware — new business
logic we explicitly avoided. For scheduled deliveries it's moot: the org expiry knob is passed straight to the
raw presigned URL (`getFileUrl(s3Key, expirationSeconds)`), so the one knob already governs the delivery link
on both the persistent and raw paths.

---

## Key code paths

| Concern                          | Location                                                                                  |
|----------------------------------|-------------------------------------------------------------------------------------------|
| Setting types + resolver         | `packages/common/src/types/organizationSettings.ts`                                       |
| DB column + entity               | migration `..._add_exporting_settings_to_organization_settings.ts`, `entities/organizationSettings.ts` |
| Model (get/update)               | `packages/backend/src/models/OrganizationSettingsModel.ts`                                |
| API service + validation         | `packages/backend/src/services/OrganizationSettingsService/`                              |
| Env → defaults helper            | `packages/backend/src/services/OrganizationSettingsService/getInstanceDefaults.ts`        |
| Per-channel expiry resolution    | `SchedulerTask.getDeliveryExpirationSeconds()`                                            |
| Raw-vs-persistent decision       | `PersistentDownloadFileService.createPersistentUrl()`                                     |
| Env default for the toggle       | `packages/backend/src/config/parseConfig.ts` (`persistentDownloadUrls.enabled`)           |
| API endpoints                    | `GET` / `PATCH` `/api/v1/org/settings`                                                     |
| Frontend panel                   | `packages/frontend/src/components/UserSettings/ExportingPanel/`                            |

---

## Validation

The settings API (`OrganizationSettingsService`) only sanity-checks expiry values: each must be a **positive
integer** (or `null` to clear). There is intentionally **no maximum** — links over 7 days are valid and just
switch to the persistent system. The frontend uses a generous 1–365 day input guardrail.

---

## Backwards compatibility

- No org row / all `null` ⇒ behaves exactly as the instance env defaults.
- `PERSISTENT_DOWNLOAD_URLS_ENABLED` keeps its `false` default, so for links ≤ 7 days nothing changes: instances
  that don't set it still get raw S3 presigned URLs. The only new behavior is the >7-day escalation, reachable
  only via the new org expiry setting.
- `getFileUrl(s3Key, undefined)` (non-delivery / interactive downloads) still falls back to `S3_EXPIRATION_TIME`.
- Narrow edge: for an instance with persistent URLs explicitly **disabled**, a delivery's raw link now honors
  the expiry knob instead of `S3_EXPIRATION_TIME`. With default config (both = 3 days) there's no observable
  difference.

---

## Frontend (Exporting panel)

- **Download link expiry** — base, full-width number input (days), with steppers.
- **Set a different expiry for specific channels** — a checkbox that reveals per-channel rows (one line each,
  full-width inputs) for the delivery methods the org has available (Email / Slack / Microsoft Teams / Google
  Chat). Each input shows a clear (✕) affordance to reset to "inherit the base"; blank ⇒ inherit. The whole
  section is hidden if no delivery method is available.
- Unticking the checkbox (or clearing a row) and saving writes `null` for those channels.
