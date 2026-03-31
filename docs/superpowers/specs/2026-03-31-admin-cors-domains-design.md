# Admin-Managed Allowed Domains for Embedding & SDK Access

## Problem

Dedicated-instance customers must contact Lightdash support to add CORS/iframe-allowed domains for their embed apps or SDK integrations. These domains are currently set via server environment variables (`LIGHTDASH_CORS_ALLOWED_DOMAINS`, `LIGHTDASH_IFRAME_EMBEDDING_DOMAINS`), which only Lightdash engineers can modify.

## Solution

Allow org admins to manage allowed domains through the UI. Each domain has a type indicating its access level:

- **SDK access** — adds the domain to CORS allowed origins (for API calls from customer frontends)
- **Iframe embed** — adds the domain to both CORS allowed origins and CSP `frame-ancestors` (for embedding Lightdash in an iframe)

Environment variable domains continue to work (backwards compatible). The effective domain list is the union of env var domains + DB domains.

## Scope

- EE-only, gated by `CommercialFeatureFlags.Embedding`
- Organization-level (not per-project)
- Admin permission required (`manage` on `Organization`)

---

## Database

### New table: `organization_allowed_domains`

| Column | Type | Constraints |
|--------|------|-------------|
| `organization_allowed_domain_uuid` | UUID | PK, generated |
| `organization_id` | INT | FK → organizations, NOT NULL |
| `domain` | TEXT | NOT NULL, e.g. `https://app.example.com` |
| `type` | TEXT | NOT NULL, DEFAULT `'embed'`. Values: `'sdk'` or `'embed'` |
| `created_at` | TIMESTAMP | DEFAULT NOW() |
| `created_by_user_uuid` | UUID | FK → users, nullable |

**Constraints:**
- UNIQUE on `(organization_id, domain)` — no duplicate domains per org
- CHECK on `type` — must be `'sdk'` or `'embed'`

**Domain format:** Stored as origin (protocol + host + optional port). No trailing slash, no path. Examples: `https://app.example.com`, `https://dashboard.acme.co:3000`.

---

## API

### Endpoints

All under `/api/v1/org/allowedDomains`. All gated by `CommercialFeatureFlags.Embedding` + `manage` on `Organization`.

| Method | Path | Body | Returns | Status |
|--------|------|------|---------|--------|
| `GET` | `/api/v1/org/allowedDomains` | — | `AllowedDomain[]` | 200 |
| `POST` | `/api/v1/org/allowedDomains` | `{ domain: string, type: 'sdk' \| 'embed' }` | `AllowedDomain` | 201 |
| `DELETE` | `/api/v1/org/allowedDomains/:domainUuid` | — | — | 204 |

### Types

```typescript
type AllowedDomainType = 'sdk' | 'embed';

type AllowedDomain = {
    organizationAllowedDomainUuid: string;
    domain: string;
    type: AllowedDomainType;
    createdAt: Date;
    createdByUserUuid: string | null;
};

type CreateAllowedDomain = {
    domain: string;
    type: AllowedDomainType;
};
```

### Validation (POST)

- Domain must be a valid origin: require `https://` protocol (allow `http://` only for `localhost`)
- Reject wildcards (`*`, `*.example.com`)
- Reject paths, trailing slashes, query strings
- Normalize: trim whitespace, strip trailing slash
- Reject duplicates: 409 Conflict

---

## Backend Merge Logic

### CORS Middleware (`App.ts`)

Currently reads from `config.crossOriginResourceSharingPolicy.allowedDomains` (env var). Change to:

1. On startup, load all org domains from DB into an in-memory cache
2. On each request, build allowed origins = env var domains + cached DB domains (all orgs, since CORS fires before auth)
3. Cache invalidated on POST/DELETE to the allowedDomains endpoints
4. Cache TTL of 60s as fallback (handles multi-instance deployments where another instance writes)

All domains (both `sdk` and `embed` types) are added to CORS allowed origins.

### CSP frame-ancestors (Helmet config in `App.ts`)

Currently configured once at startup from `config.embedding.iframeAllowedDomains`. Change to:

1. Make CSP `frame-ancestors` dynamic (set per-response via middleware, not at startup)
2. frame-ancestors = env var iframe domains + cached DB domains **where type = 'embed'** (not `sdk`)
3. Same cache as CORS, filtered by type

### Caching strategy

- Single in-memory cache of `AllowedDomain[]` per instance
- Populated on first request, refreshed every 60s or on local write
- Cross-instance consistency: 60s eventual consistency is acceptable for admin config changes
- Cache key: none (global — all orgs). Filter by org_id if needed at query time, but for CORS/CSP we need all domains anyway

---

## Frontend

### Location

New component at `packages/frontend/src/ee/features/embed/SettingsAllowedDomains/` following existing EE feature structure.

### Route

Added to `Settings.tsx` org settings section:
- Path: `/generalSettings/organization/allowedDomains`
- Nav label: "Allowed Domains"
- Gated by: `CommercialFeatureFlags.Embedding` enabled + user can `manage` on `Organization`

### UI Layout

`SettingsGridCard` with:
- **Left column:** Title "Allowed Domains", description: "Manage which external domains can access your Lightdash instance via the SDK or iframe embedding. Domains configured via server environment variables are always allowed."
- **Right column:** Domain list + add form

### Domain List

Each row shows:
- Domain URL (text)
- Type badge/pill: "SDK access" or "Iframe embed"
- Delete button (icon)
- Tooltip or secondary text with "Added on {date}"

Empty state: "No custom domains configured."

### Add Domain Form

Inline at the bottom of the list:
- Text input for domain URL (placeholder: `https://app.example.com`)
- Select/dropdown for type: "SDK access" / "Iframe embed"
  - "SDK access" — "Can make API requests from this domain"
  - "Iframe embed" — "Can embed Lightdash in an iframe from this domain"
- "Add" button

### Hooks

- `useAllowedDomains()` — GET query
- `useAddAllowedDomainMutation()` — POST mutation, invalidates query cache
- `useDeleteAllowedDomainMutation()` — DELETE mutation, invalidates query cache

Standard TanStack Query patterns with toast notifications on success/error.

---

## Security

### Domain validation (strict)

- Require `https://` (allow `http://localhost:*` for development)
- Reject wildcards, IP ranges, bare hostnames without protocol
- Reject paths and query strings — origins only
- Normalize before storage (trim, lowercase host, strip trailing slash)

### Access control

- All endpoints require `manage` on `Organization` (org admin only)
- Feature-gated behind `CommercialFeatureFlags.Embedding`
- Env var domains cannot be viewed, modified, or deleted via UI — they're additive-only from the server config

### CORS scope

- CORS middleware fires before auth, so DB domains are loaded for all orgs (not org-scoped at request time)
- This matches current env var behavior (global)
- For dedicated instances (single org), this is equivalent
- For multi-org instances, domains from all orgs are merged into the CORS allowlist — acceptable since CORS is a browser-side check and the API still enforces auth per-request

### iframe scope

- `frame-ancestors` is also set globally (same as CORS reasoning)
- Only `embed`-type domains are added to `frame-ancestors` — `sdk`-type domains do NOT get iframe permission
- This prevents unnecessary clickjacking surface for SDK-only customers

### Cache invalidation

- Removed domains remain effective for up to 60s on other instances
- Acceptable for admin config — not a real-time security control
- If instant revocation is needed in the future, we can add a pub/sub invalidation channel

---

## Backwards Compatibility

- Env var `LIGHTDASH_CORS_ALLOWED_DOMAINS` continues to work as-is
- Env var `LIGHTDASH_IFRAME_EMBEDDING_DOMAINS` continues to work as-is
- DB domains are **additive** — they extend the env var list, never replace it
- Instances without the embedding feature flag see no change
- No migration of existing env var domains into DB — they coexist

---

## Out of Scope

- Per-project domain scoping (future enhancement)
- Wildcard/subdomain pattern matching (use explicit origins)
- Domain verification (DNS-based ownership proof)
- Audit log for domain changes (we store created_by but no deletion log)
- Bulk import/export of domains
