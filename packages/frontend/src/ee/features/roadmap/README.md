# Project roadmap

The Settings roadmap consumes `/api/v1/org/roadmap/projects` and `/api/v1/org/roadmap`. Both derive organization identity from the authenticated account and retain the existing roadmap permission, feature flag and license checks. Lightdash validates the Control Center response before returning it. Provider credentials never reach the browser. The issue endpoint accepts `projectId=<id>` for project tickets or `projectId=null` for loose tickets, alongside search, status, priority and pagination parameters. Unfiltered issue reads retain their existing response. Filtered reads add each ticket’s `projectId` and response-level `expiresAt`, and retain `totalIssues` pagination and facets. Both Lightdash endpoints proxy the matching v1 Control Center routes under `/api/v1/roadmap/organizations/:organizationUuid`.

The roadmap uses the shared Settings page header and search input, with Status, Priority, and Interest facets on the left and board/table controls on the right. The Interest dropdown offers the single-choice options “Following” and “All” (the default). Backlog and planned items share the customer-facing “Backlog” status in the board, table, and filters. Paused projects appear as “In progress,” including when filtering by status. Filters apply before pagination; project ticket filters are separate from the main board filters.

Projects and loose tickets share a board or table. Opening a project shows the organization's visible linked requests in the selected view. Project cards show their icon, priority and overall progress, with positive followed-ticket counts below the title. Direct project interest with no visible tickets displays “Interested.” The “Following” interest filter includes direct organization project needs or projects with visible organization requests. Loose tickets already belong to the organization. Following is organization-level customer relevance, not an individual subscription system.

Control Center alone determines eligibility: customer needs linked directly to a project or through its issues qualify projects, excluding needs from the Lightdash customer. Active projects and projects completed within the past 30 days are eligible; canceled, archived, deleted, unlinked and blank-title projects are excluded. Existing public-issue curation and 30-day terminal-ticket retention remain unchanged. Requests whose parent is ineligible appear as loose tickets. No other customer's identity or requests are returned.

Search and the “Following” interest filter are applied before catalog pagination. Projects are alphabetical; tickets retain central priority/update ordering. Pages load on demand. The frontend hides expired titles and requests immediately, attempts refresh, and offers retry on failure. Expiry reflects the earlier of the provider snapshot's 10-minute freshness deadline and any approaching 30-day retention boundary.

## Validation

The Settings page uses the live v1 API in every environment. Keep `LIGHTDASH_ENABLE_FEATURE_FLAGS=organization-roadmap` enabled for local verification.

To use a local Control Center, set `LIGHTDASH_ROADMAP_API_URL=http://127.0.0.1:8081` in the workspace root's `.env.development.local` and restart the API. The default is `https://roadmap.lightdash.com`.

Emoji and supported named project icons render locally; unknown named icons use a folder fallback. The design-partner action and signup flow belong to a separate feature and are not included here.

## Deployment and rollback

1. Deploy the Control Center project catalog and filtered issue support first. Confirm a bound test organization can read both v1 endpoints, unbound organizations are denied, and unfiltered issue reads still work.
2. Deploy the Lightdash consumer after central verification. Existing license bindings and roadmap flags still control access; no cloud access expansion is included.
3. Smoke-test board/table switching, a completed project, interest filtering, linked request details, search and pagination. On refresh failure, verify titles disappear at expiry.
4. Roll back Lightdash first if necessary. Control Center can retain the additive project endpoint and issue filters while older instances continue making unfiltered issue reads. Disabling the existing roadmap feature flag hides the feature if an immediate containment step is needed.

No migration or new credentials are needed. Integrated production rollout remains PROD-10992.
