# Triage

Detect purpose, not quality.
Read the whole diff/title (`gh pr diff <pr>`, `gh pr view <pr> --json title`).
Answer every tag yes/no with a changed `file:line` as working evidence.
Favour recall: borderline purpose means yes; extra tags cost only a lens's Skip when check.
Absence means “not detected”, not “untouched”; trust absence only for Schema/Warehouse.
Core is most often missed.

## Detection and skips

- **Files:** skip these.
  - Tests and specs, stories, mocks, fixtures, evals, test apps (`packages/*-test-app`).
  - Docs, including `AGENTS.md`, `CLAUDE.md` and `.claude/` skills; `examples/`; translations.
  - Generated files: `generated/`, lockfiles, `swagger.json`, TSOA `routes.ts`, `.snap`, `common/src/schemas/json/{chart-as-code,dashboard-as-code,mcp-tools}`, `*generated*` or `@generated`.
  - Constructor wiring, only where dependencies are passed (`ee/index.ts`, `ServiceRepository.ts`, `ModelRepository.ts`).
  - Exceptions: tests and their inputs remain evidence, and files a lens names are read (MCP snapshots, dependency resolutions).
  - Test infrastructure is Tooling; tests and specs themselves go to [testing.md](testing.md).
- **Lines:** skip blanks, comments, imports/re-exports unless they change execution (component substitution, side-effect imports).
  Pure moves count for neither side; confirm with `git diff --color-moved` and review changed behaviour only.
- **Runtime exceptions:** product-loaded Markdown/prompts/skills under `packages/*/src/` and comments driving generated API metadata count as code.
  `App.ts` routes/middleware count.
- **Purpose/effect:** tag changed behaviour wherever it lives, including effects on unchanged consumers.
  Follow compared/loaded values (hashes, versions, cache keys, defaults, stored shapes).
  Stack-parent code is existing code.
  Flag all matching tags; lenses settle overlaps.
  Check common response types for API effects even without controller edits.

## Tags

Lens order for all review output.
Each tag, then what it detects:

- **Schema:** migrations/schema/data, stored JSON shapes, widened values written to existing columns.
- **Access:** CASL, auth, SCIM, roles, service accounts, PATs, OAuth, share links, ForbiddenError guards.
- **Security:** allowlists, network binding, TLS/CA, redaction, caches, HTML/Markdown sanitizing, credential scopes/destinations, security bumps/overrides.
- **Core:** Load-bearing methods ([core.md](lenses/core.md)); SQL/results, compiler, query builder, pivots, templates, parameters, formulas, calcs, caches, pre-aggregates; query filter/parameter/tile-target selection, explore naming/compilation/cache publication.
- **Performance:** indexes, caches, batching, round trips, per-request/render/row work, polling, bundles, memory/disk.
- **API:** routes (including hidden/legacy), requests/responses, frontend lightdashApi shapes, common response fields, statuses, embed events, external package exports, pgwire statements, published release-safety files/schemas.
  Repo-only exports aren't API.
- **MCP:** outside-client tool names, schemas, outputs/descriptions; McpService, common AI tool schemas, contract snapshot.
- **Warehouse:** adapters, dialect SQL, dbt parsing/versions, warehouse credentials.
- **Sandbox:** e2B/Azure runtime/providers, channels, templates, limits, cleanup, session/usage/cost metering, Python query nodes/harness.
- **Embed:** viewer-visible behaviour, service/SDK/JWT, isEmbedded branches, components newly reachable in embeds.
- **Config:** env vars, flags/defaults, flag-off behaviour, retired-config, licence/edition entitlements.
- **Integrations:** outbound Slack/email/Google/Teams, Unfurl/browser, Git/dbt hosts, Jira, S3, webhooks.
- **Jobs:** scheduler/workers/NATS, addJob/payloads, changed comparisons or source/row selection altering existing jobs.
- **AI Agent:** in-app models (including side calls), prompts, built-in skills, tool descriptions/code, hints, lists/loadouts.
- **Dependencies:** dependency entries/catalogs, Python pins, Docker FROM.
- **Live data sources:** non-warehouse source querying/mapping, QuerySourceService/api connectors, ExternalSource (CSV/Sheets), ExternalConnection.
- **Content as code:** chart/dashboard YAML, dbt meta, model YAML/JSON schemas, integration-as-code, promotion, CLI download/deploy.
- **UI:** frontend/visualization, common chart rendering/formatting/tooltips/colours, uiStrings.
- **Observability:** metrics, spans, structured logs/context, Sentry, product/usage events anywhere.
- **Tooling:** CI/build/dev, workflows/scripts/Docker/configs/package scripts, preview environments, test infrastructure, dev seeds.
- **Data apps:** apps or query-sdk.
- **CLI:** packages/cli source.

## Coverage and depth

Give each unskipped changed file a detected tag; use the nearest fitting tag.
Never force a bad fit: unmatched files get shared review checks.
Triage mode's coverage check only adds tags.

**quick:** one pass, then coverage.
**deep:** two independent passes, union their tags; follow changed compared/loaded values into readers and add their tags, then coverage.

## Review selection

- **Explicit lens names:** skip detection and run only those lenses, subject to the checks below.
  Otherwise add always-on **Security and Performance** to detected lenses.
  Testing always follows lens execution, including explicit selections.
- **Skip when:** drop a lens quietly only if its Skip when covers every change triggering it.
  Drop lenses with all checks n/a too; always-on lenses cannot be dropped by either rule or Size.
- **Size:** UI, Observability, Tooling, Data apps and CLI skip checks below 5 changed code lines; all others ignore size.
  Count added+deleted lines in triggering files after the skips above.
  Moves count only when order, scope or conditions change execution.
  Skipped lenses still supply noticed Diff rows under [shared policy](lenses/README.md); defects found while reading stay on their lens.
- **Too big:** never line count alone.
  Heads-up on the first lens if independently shippable changes touch two or more of Schema/Access/Core/Security, or a serious lens can't trace its main path in one pass.
  Migration plus dependent code is one change.
  Name the cuts and `deep` as next step.
  Verdict consequences live in [review.md](review.md#verdict).

## Output

Triage mode returns only detected tags, in tag order, as bullets (`- API`); `- —` if none.
No evidence or commentary.
