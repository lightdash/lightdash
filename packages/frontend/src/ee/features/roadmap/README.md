# Project roadmap

The Settings roadmap consumes `/api/v2/org/roadmap/projects` and `/api/v2/org/roadmap/requests`. Both derive organization identity from the authenticated account and retain the existing roadmap permission, feature flag and license checks. Lightdash validates the Control Center response before returning it. Provider credentials never reach the browser. The v1 endpoint and its response remain compatible with older installations.

The roadmap uses the shared Settings page header and search input, with Status, Priority, and Interest facets on the left and board/table controls on the right. The Interest dropdown offers the single-choice options “Following” and “All” (the default). Backlog and planned items share the customer-facing “Backlog” status in the board, table, and filters. Paused projects appear as “In progress,” including when filtering by status. Filters apply before pagination; project ticket filters are separate from the main board filters.

Projects and loose tickets share a board or table. Opening a project shows the organization's visible linked requests in the selected view. Project cards show their icon, priority and overall progress, with positive followed-ticket counts below the title. Direct project interest with no visible tickets displays “Interested.” The “Following” interest filter includes direct organization project needs or projects with visible organization requests. Loose tickets already belong to the organization. Following is organization-level customer relevance, not an individual subscription system.

Control Center alone determines eligibility: a direct customer-to-project need from any customer qualifies a project. Issue-only needs do not. Active projects and projects completed within the past 30 days are eligible; canceled, archived, deleted, unlinked and blank-title projects are excluded. Existing public-issue curation and 30-day terminal-ticket retention remain unchanged. Requests whose parent is ineligible appear as loose tickets. No other customer's identity or requests are returned.

Search and the “Following” interest filter are applied before catalog pagination. Projects are alphabetical; tickets retain central priority/update ordering. Pages load on demand. The frontend hides expired titles and requests immediately, attempts refresh, and offers retry on failure. Expiry reflects the earlier of the provider snapshot's 10-minute freshness deadline and any approaching 30-day retention boundary.

## Local review

`/dev/roadmap` provides synthetic scenarios for populated, empty, loading, retry, access denied, removed projects, missing titles, pagination and expiry. The review expiry scenario uses 12 seconds. `VITE_ROADMAP_MOCK_API=true` in `packages/frontend/.env.development.local` also enables fixtures on the Settings page in development only. Turn it off to exercise the live consumer. Keep `LIGHTDASH_ENABLE_FEATURE_FLAGS=organization-roadmap` enabled locally. The mock switch is ignored in production.

Project metadata travels through the same response contract in the preview and live UI. Emoji and supported named project icons render locally; unknown named icons use a folder fallback. The design-partner action and signup flow belong to a separate feature and are not included here.

## Deployment and rollback

1. Deploy Control Center v2 first. Confirm a bound test organization can read both v2 endpoints, unbound organizations are denied, and v1 still works.
2. Deploy the Lightdash consumer after central verification. Existing license bindings and roadmap flags still control access; no cloud access expansion is included.
3. Smoke-test board/table switching, a completed project, interest filtering, linked request details, search and pagination. On refresh failure, verify titles disappear at expiry.
4. Roll back Lightdash first if necessary. Central can retain v2 while older instances continue using v1. Do not remove central v2 while any consumer still calls it. Disabling the existing roadmap feature flag hides the feature if an immediate containment step is needed.

No migration or new credentials are needed. Integrated production rollout remains PROD-10992.
