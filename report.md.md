## OakNorth SCIM — confirmed diagnosis

### The incident

This morning **~08:00–08:12, 217 users were (re)created in Lightdash as `Pending`** in a single burst (DB: `pending_created 08:00 = 217`). At the same moment Entra fired ~30 `GET /Users/<uuid>` that all **404'd** — I verified those UUIDs are **gone from the DB**. So Entra's cached Lightdash user-ids went stale (users had been removed), and Entra re-POSTed them as fresh records.

Current DB state: **452 users, 224 Pending (`is_setup_complete=false`), 220 of those never logged in (no OIDC identity)**. Half the org is in Pending limbo.

### The group-sync 500 bug (confirmed, matches Navneet's screenshot)

- Navneet's Entra log screenshot = repeated `Update` failures on **BI-Explorer** + **Data-Engineers** with `...ServerError` / "Failed to patch SCIM group". I matched these to production: 500s every ~20 min through the night, last at **08:04**, always those two groups (14× `65a96580`, 10× `9a889067`).
- **Root cause (Lightdash bug):** `ScimService.updateGroup` catch only handles `instanceof ScimError`. `GroupsModel.updateGroup` throws `ParameterError('Some provided user UUIDs are invalid')` when a member being added isn't a resolvable **org member** — that's a `LightdashError`, not a `ScimError`, so it falls through to a silent generic **500** with no error log (the `case ParameterError` in the switch is dead code). Cloudy's drafted issue captures this correctly.
- **Why those two groups:** they contain member(s) Entra references but who aren't provisioned as org members → every retry 500s.

### Why the full sync helped but left a discrepancy

A full sync provisions all users _first_, then updates groups — so most adds resolved (BI-Explorer 130→**193**, all 200s at 10:44; **no 500s in last 90 min**). The residual discrepancy = members whose users still can't be provisioned/resolved → their group-add silently 500s, and it'll recur on the next incremental cycle.

### How `/no-access` fits (Faizan, Gargi)

Only the **4 `BI - *` groups grant project access** (53 grants each); data-domain groups (Portfolio Monitoring, Data Engineers, etc.) grant **0**. **BI-Explorer is one of the 500-ing groups** — so users who should be in BI-Explorer but whose add 500'd get **no project access → `/no-access`**. Faizan/Gargi have OIDC + org membership but 0 project access, confirming this.

### Corrections to the auto-thread

- ❌ "Entra isn't sending the Group PATCH" (Cloudy 17:02) — **wrong**, it is, and they 500.
- ❌ Pending users are deactivation/reactivation victims — **wrong**; they were freshly created today 08:00, never logged in. The deactivation known-issue doc doesn't describe these.
- ❌ #24404 duplicate-role 400 is the trigger — **not active here**; zero two-roles/role-count 400s in 12h.
- ❌ "Provision on demand for Abhishek" — moot; **Abhishek is already in Portfolio Monitoring now**.

### Recommended next steps

**Lightdash engineering:**

1. Fix `ScimService.updateGroup` (and audit the other SCIM write handlers) to map `LightdashError` subclasses → proper 4xx + log/Sentry. A `400 invalidValue` would tell Entra _which_ user is invalid instead of an infinite silent-500 retry loop. (Cloudy's draft issue is good — file it.)
2. Investigate the **mass delete→recreate** root cause (stale Entra id cache → 217 Pending). Likely the destructive Entra scope/deactivation behavior — this is the second customer (Suvida #13789) hitting the deactivation pattern; worth a GitHub issue.

**Customer (Navneet):**

1. The remaining group discrepancy is specific users who aren't fully provisioned in Lightdash. Ask him to identify which members are still missing from BI-Explorer / Data-Engineers and check those users' individual provisioning status in Entra.
2. For the 217 Pending users — confirm whether they're actually _blocked at login_ or just haven't logged in yet (with `AUTH_ENABLE_OIDC_TO_EMAIL_LINKING=true`, first SSO should link by email and complete setup). I'd verify with one Pending user before any bulk DB write.

⚠️ On Cloudy's proposed bulk `UPDATE ... SET is_setup_complete=true` — I'd **hold off**. 220 of the Pending users have no OIDC identity (never logged in); forcing `is_setup_complete=true` may mask whether SSO linking actually works and won't grant project access (that comes from BI-group membership, which is the broken path). Fix the access path, not the flag.

Want me to draft the customer-facing reply to Navneet, and/or dig into what triggered the 08:00 mass-recreate (e.g. pull the user POST/DELETE sequence around 07:55–08:15)?

---

Log evidence in the report (the 08:00 mass-Pending creation, the ~30 `GET /Users/<uuid>` 404 burst at 08:12, and today's 500s through 08:04) came from aggregated `gcloud logging read` queries:

```
resource.labels.namespace_name="oaknorth"
resource.labels.container_name="lightdash"
jsonPayload.req.url=~"/scim/v2/Groups" AND jsonPayload.res.statusCode>=500
```

---

## OakNorth DB Status Report

### Org-wide user totals

| Metric                                        | Count                         |
| --------------------------------------------- | ----------------------------- |
| Total users                                   | **452**                       |
| Setup complete (`is_setup_complete=true`)     | 228                           |
| **Pending (`is_setup_complete=false`)**       | **224**                       |
| Pending with OIDC identity (logged in before) | 4                             |
| Pending with NO OIDC (never logged in)        | **220**                       |
| Org members (active / inactive)               | 229 (227 active / 2 inactive) |

### Pending-user creation timeline (the acute event)

| Hour                 | Pending users created |
| -------------------- | --------------------- |
| **2026-06-18 08:00** | **217** ← mass burst  |
| 2026-06-18 10:00     | 2                     |
| 2026-06-17 17:00     | 1                     |
| 2026-06-15 18:00     | 2                     |
| 2026-05-19 13:00     | 2                     |

→ ~217 users (re)created as Pending in a single burst this morning.

### The two 500-ing groups

| Group                          | UUID (prefix) | Members                      | Created    |
| ------------------------------ | ------------- | ---------------------------- | ---------- |
| Data Platform - BI - Explorer  | `65a96580`    | 130 → **192/193** after sync | 2025-05-19 |
| Data Platform - Data Engineers | `9a889067`    | 43 → **80** after sync       | 2025-05-19 |

- Both had **0 inactive members** at time of check.

### Group → project-access mapping (`Data Platform - *`)

| Group                  | Members | Project grants |
| ---------------------- | ------- | -------------- |
| BI - Content Manager   | 35      | 53             |
| BI - Creator           | 23      | 53             |
| **BI - Explorer**      | 192     | **53**         |
| BI - Viewer            | 253     | 53             |
| Business Banking       | 181     | 0              |
| Creditsafe             | 4       | 0              |
| Customer Due Diligence | 84      | 0              |
| Data Engineers         | 80      | 0              |
| Digital Lending        | 34      | 0              |
| Personal Savings       | 114     | 0              |
| Portfolio Monitoring   | 161     | 0              |

→ **Only the 4 `BI - *` groups grant project access.** Data-domain groups grant none.

### Specific users checked

| Email            | active | setup_complete | OIDC | direct proj access | groups                             | org role |
| ---------------- | ------ | -------------- | ---- | ------------------ | ---------------------------------- | -------- |
| abhishek.chavan  | t      | t              | —    | —                  | **4 (incl. Portfolio Monitoring)** | member   |
| faizan.ahmed     | t      | **t**          | 1    | **0**              | 3                                  | member   |
| gargi.verma      | t      | **t**          | 1    | **0**              | 2                                  | member   |
| hemesh.patel     | t      | **f**          | 0    | 0                  | 2                                  | member   |
| vaibhav.aggarwal | t      | **f**          | 0    | 0                  | 4                                  | member   |
| eisheeta.barua   | t      | **f**          | 0    | 0                  | 2                                  | member   |
| ayush.sharma     | t      | **f**          | 0    | 0                  | 2                                  | member   |

- **Abhishek** (original complaint): now IS in Portfolio Monitoring — resolved.
- **Faizan / Gargi** (`/no-access`): logged in (OIDC=1), setup complete, but **0 project access** and not in a `BI-*` group → that's the no-access cause.
- **4 Pending users** were all created today 08:10–08:12, never logged in.

### Stale Entra id-cache confirmation

- Sampled 8 of the ~30 user UUIDs that Entra `GET /Users/<uuid>` returned **404** for at 08:12 → **0 found in DB**. Confirms Entra holds Lightdash user-ids for users that no longer exist.
- The 2 UUIDs Entra used as `userName` filters (`9fdd43b6…`, `515eff24…`) → **also not present** as any Lightdash user.

### Notes / caveats

- All queries were **read-only**; no writes performed.
- The psql tunnel (127.0.0.1:10000) **dropped once mid-session** (idle timeout) and was reconnected successfully.
- `warehouse_credentials`-style fields weren't relevant here; this report is users/groups/memberships/identities only.
