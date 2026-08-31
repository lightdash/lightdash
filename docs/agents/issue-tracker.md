# Issue tracker: Linear (internal, default) + GitHub (public)

Two trackers, one rule: **default to Linear; if it's questionable which tracker an issue belongs in, ask.**

- **Linear** — internal tracker. All planning-stage work lives here: wayfinder maps, specs, ticket breakdowns, and any planned fix or feature request that no customer asked for.
- **GitHub** (`lightdash/lightdash` Issues) — public open-source tracker. An issue goes (or moves) here when a customer requested it or is responding on it.

## Access

- **Linear**: use whatever Linear access is available (MCP tools, API).
- **GitHub**: the `gh` CLI. The repo is inferred from `git remote -v`.

## Bridging Linear ↔ GitHub

- GitHub issues auto-sync into Linear (they land in the PROD team, Triage) via a `<!-- linear-linkback -->` comment on the GitHub issue.
- Republishing anything from Linear to GitHub requires the user's explicit authorization for that specific ticket — confirm before publishing.
- To take a private Linear ticket public (once authorized): cancel the original, publish a sanitized GitHub issue, then restore the original's team/project/status/assignee onto the Linear ticket the sync auto-creates.
- Anything published to GitHub is public: sanitize first (no customer names, domains, emails, workspace names, secrets, or exact business data; use generic actors like "a user", "a customer") and match `.github/ISSUE_TEMPLATE/bug_report.yml` for bugs.

## When a skill says "publish to the issue tracker"

Create a Linear issue. Only publish to GitHub when a customer requested the issue or is engaging on it — and then sanitized.

## When a skill says "fetch the relevant ticket"

Resolve by identifier shape: `ABC-123` (e.g. `PROD-1234`) is a Linear issue; `#123` or a github.com URL is a GitHub issue — `gh issue view <number> --comments`.

## Triage surface

The triage label vocabulary in `docs/agents/triage-labels.md` exists in **both** trackers under the same names. Triage follows the same default: work the Linear queue (GitHub issues auto-sync there anyway); apply labels on the GitHub side too when the issue is public and a customer is watching it.

**PRs as a request surface: no.** _(Set to `yes` if external PRs should be treated as feature requests; `/triage` reads this flag.)_

## Wayfinding operations

Used by `/wayfinder`. Everything lives in Linear.

- **Map**: a single Linear issue holding the Notes / Decisions-so-far / Fog body, labeled `wayfinder-map` (create the label if missing).
- **Child ticket**: a sub-issue of the map. Label `wayfinder-<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, assigned to the driving dev.
- **Blocking**: Linear's native "blocked by" issue relations. A ticket is unblocked when every blocker is Done/Canceled.
- **Frontier query**: the map's open sub-issues with no open blocker and no assignee; first in map order wins.
- **Claim**: assign the sub-issue to yourself — the session's first write.
- **Resolve**: comment the answer on the sub-issue, mark it Done, then append a context pointer to the map's Decisions-so-far.
