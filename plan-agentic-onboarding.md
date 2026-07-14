# Feature Plan: Agentic Onboarding — Snowflake Golden Path

**Requirement:** Take a brand-new user from signup to a live, governed dashboard built on their own warehouse data in one self-serve session — no terminal, no YAML. 4-step spine: 1 Connect → 2 Profile → 3 Semantic layer → 4 Dashboard. Full brief: `~/Downloads/agentic-onboarding-requirements.md`.
**Scope this iteration:** Snowflake end-to-end only, plus a minimal demo-project escape hatch. Other warehouses connect via the generic method framework (manual form fallback). Feature-flagged, incremental commits, tested against the local dev stack.
**Date:** 2026-07-13
**Status:** Approved — implementation starting
**Reviewed by:** research, architect, frontend, backend, adversarial, QA (all plans cross-challenged; two architecture forks adjudicated in code)

---

## Overview

Mostly assembly over verified infrastructure, not greenfield. The Snowflake client already supports the auth methods and introspection we need; dbt-less (`DbtProjectType.NONE`) projects plus programmatically-built Explores give us a governed semantic layer with zero YAML; the existing `Job`/`JobStep` polling infra ("Test & deploy" mechanism) powers all live-progress checklists; chart/dashboard create services power the starter dashboard. The genuinely net-new surfaces are: (1) the ordered warehouse diagnostic test-connection engine with error→diagnosis→GRANT-remedy mapping, and (2) the deterministic semantic-layer/dashboard generator.

## Locked Decisions (adjudicated during planning)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Deterministic heuristic generator in OSS core** (no LLM on critical path) | EE AI path is license-gated, needs an LLM key, slow, non-deterministic. AI enrichment = later, copilot-flagged, over deterministic output. |
| D2 | **v1 auth methods: key-pair (recommended) → CLI-assisted SSO bridge → password → paste → manual.** NO server-side external-browser, NO OAuth, NO KeepAliveChoice screen | Server-side EXTERNAL_BROWSER is impossible (Snowflake driver docs; GH #18546). OAuth needs customer-admin security integration — not first-session-completable. Server-side PAT minting after password/key-pair is broken AND pointless (`createProgrammaticAccessToken` L432 throws unless authenticator===EXTERNAL_BROWSER; key-pair/password are already durable). |
| D2b | **CLI-assisted SSO bridge IN v1 (user decision 2026-07-13):** wizard shows copy-paste `npx @lightdash/cli` commands with a short-lived one-time code → CLI runs `externalbrowser` SSO on the USER'S machine → CLI mints a named scoped Snowflake PAT (`ALTER USER ADD PAT` — the one context where `createProgrammaticAccessToken` works; plumbing exists in `packages/cli/src/warehouse/getWarehouseClient.ts`) → CLI deposits the PAT to a new endpoint authenticated by the one-time code → wizard polls and auto-advances into the connection test. PAT = durable revocable credential for scheduled refreshes. Serves SSO-only Snowflake shops (Snowflake is deprecating single-factor password auth), where key-pair needs an admin and password may not exist. Labelled honestly in UI ("uses our CLI") — the mandatory golden path remains terminal-free, so §10's no-CLI promise holds for the recommended route. Caveats: Snowflake may require network policies for PAT use; PAT hygiene per #23924 (one named PAT per user+project, reuse/rotate, revoke on disconnect); likely needs `PROGRAMMATIC_ACCESS_TOKEN` added to `SnowflakeAuthenticationType` + token stored in existing `token` sensitive field (verify against installed snowflake-sdk). |
| D2d | **OAuth local-application pivot (user decision 2026-07-14, supersedes the auth mechanics of D2b/D2c):** research confirmed the externalbrowser/console-login mechanism is retired platform-wide (classic console removed, BCR-2080) and Snowflake GA'd a built-in OAuth Authorization Code + PKCE flow for local apps (Jan 2026, `SNOWFLAKE$LOCAL_APPLICATION` public client — zero customer setup, no client secret, federates to the customer IdP, issues refresh tokens). The CLI bridge now authenticates via `OAUTH_AUTHORIZATION_CODE` with `oauthClientId: 'LOCAL_APPLICATION'`; the deposited durable credential is the **OAuth refresh token** (already in `sensitiveCredentialsFieldNames`), replacing PAT minting. Backend exchanges refresh→access tokens at query time. snowflake-sdk upgraded 2.3.4→3.x. Key-pair demotes to advanced fallback in the method registry; the console-login fallback is removed as dead code. Sources: docs.snowflake.com/en/user-guide/oauth-local-applications, /release-notes/bcr-bundles/2025_06/bcr-2080, /user-guide/security-mfa-rollout. |
| D2c | **Least-friction CLI auth (user decision 2026-07-14): CLI takes only `--url --code --account --user`.** After SSO the CLI mints a user-scoped (role-unrestricted) PAT — accepted trade-off, scopes/roles narrowed later — queries session defaults (`CURRENT_ROLE/WAREHOUSE/DATABASE`) plus inventory (`SHOW DATABASES/WAREHOUSES/ROLES`), and deposits all of it. Backend auto-configures the connection from the defaults and runs diagnostics immediately (zero picks); the wizard shows "Connected — change?" with inventory-fed dropdowns for narrowing. Only a missing default prompts a wizard picker. Database/warehouse/role CLI flags remain as optional overrides. |
| D3 | **Semantic layer = programmatic `Explore`s via `ExploreCompiler.compileExplore({tables, joinedTables})` persisted with `ProjectModel.saveExploresToCache` — every generated explore tagged `type: ExploreType.VIRTUAL`** | `createVirtualView` hardcodes `metrics:{}`/`joinedTables:[]` — can't express §5/§6. `saveExploresToCache` is delete-all-then-reinsert but preserves `explore->>'type'='virtual'` rows → VIRTUAL tag buys survival across dbt deploy/refresh/catalog-index. Verified by 3 agents independently. |
| D4 | **Field rename/toggle = NEW targeted per-name `cached_explore` JSON mutation** (label/hidden) | Round-tripping `saveExploresToCache` silently reverts edits (DB virtual views re-added after passed array); stock `updateVirtualView` rebuilds via `createVirtualView` → wipes metrics/joins. Both traps verified in code. |
| D5 | **Connection test = SYNC session-only endpoint** returning ordered `checks[]` with real per-check `durationMs`, stop-at-first-failure. NO Graphile job | A job would serialize raw unencrypted creds into the `graphile_worker` table — violates write-only-secrets. Frontend animates progressive reveal of real timings. |
| D6 | **Profile / semantic-gen / dashboard-build = async Graphile jobs** polled via existing `GET /api/v1/jobs/:jobUuid`; new `JobType.ONBOARDING_PROFILE/_SEMANTIC/_DASHBOARD` + JobSteps render the live checklists | Reuses the entire "Test & deploy" progress mechanism. No SSE (LB idle-timeout drops). |
| D7 | **Resumability: in-session only pre-project** (URL params + lifted form; secrets never persisted); **post-create resume from new `onboarding_project_state` table** | Backend stateless-secrets stance wins; no `onboarding_draft` table. |
| D8 | **Wizard entry guard: user has `create:Project` AND org has zero projects**; everyone else routes home | Prevents invited-member 403s and duplicate projects for second admins. |
| D9 | **Minimal demo hatch IN scope (user-confirmed):** "Explore the demo project" button on signup/warehouse/method screens routing to the existing seeded demo project | Restores the brief's mandatory "never trapped" guarantee after the passwordless + sample-data cuts. |
| D10 | Sample→real migration (§11.1): **fresh generated set** on real connect, no edit carry-over | Schema-derived identities won't line up across schema swap. |
| D11 | SSRF/port-scan risk on test endpoint: **accepted for v1** (user call), but raw socket errors always suppressed via diagnosis mapping | Friendly diagnoses are needed for §4.5 anyway; reduces the error/timing oracle. |
| D12 | Live Snowflake verification: **user provides creds during build**; 4 live-only areas tested when diagnostics slice lands | Local stack has PG warehouse only. |

## Architecture

```
[signup Register.tsx / Google SSO] ──▶ OnboardingWizard (NEW, flag: AgenticOnboarding)
   │  entry guard: create:Project + zero projects; demo hatch on every screen
   ▼
 STEP 1 CONNECT
   POST /api/v1/onboarding/connection/test  (SYNC, session-only, stateless)
     └► WarehouseDiagnosticsService (NEW) → SnowflakeWarehouseClient
        resolve host → connect/TLS → authenticate(as role) → list schemas → SELECT 1
        stop-at-failure → {status, checks[{id,label,status,durationMs,diagnosis{title,detail,remedySql,docsUrl}}]}
   POST /api/v1/onboarding/connection/grant-script → {sql}   (least-privilege LIGHTDASH_ROLE template)
   create project: EXISTING POST /org/projects (createWithoutCompile, DbtProjectType.NONE + SNOWFLAKE)
   ▼
 STEP 2 PROFILE      POST /projects/:uuid/onboarding/profile → {jobUuid}   (Graphile task)
   getAllTables + INFORMATION_SCHEMA ROW_COUNT → getCatalog/getFields (≤5 concurrent, ≤100 tables, time-boxed)
   entity descriptions + PK/FK relationship inference (confidence-scored) → JobSteps → FE polls /jobs/:jobUuid
   ▼
 STEP 3 SEMANTIC     POST /projects/:uuid/onboarding/semantic-layer → {jobUuid}
   SemanticGenerationService (NEW, deterministic): dims per column (+time intervals),
   metrics by name/type heuristics, joins from inferred relationships, curated to primary entity + few joins
   → compileExplore → validation ("0 errors") → saveExploresToCache (VIRTUAL-tagged)
   PATCH …/semantic-layer/fields → targeted cached_explore mutation (rename/toggle)
   ▼
 STEP 4 DASHBOARD    POST /projects/:uuid/onboarding/dashboard → {jobUuid}
   DashboardBuilder (NEW, deterministic): KPI row w/ period-over-period deltas (two date ranges in ONE SQL,
   never client math), time-series this-vs-prev, categorical top-N, segment breakdown, date+dimension filters
   → SavedChartService.create + DashboardService.create (transactional) → redirect to real dashboard

 State: onboarding_project_state (NEW table). Progress: existing Job/JobStep polling. No SSE.
```

### Package scope
- **common**: `types/onboarding.ts` (unified `ConnectionCheck`/`ConnectionDiagnosticResult`, profile/generation result types), `FeatureFlags.AgenticOnboarding`, JobType/JobStepType/JobLabels additions. No new sensitive cred fields in v1 (PAT dropped).
- **warehouses**: Snowflake ordered diagnostic checks + structured error mapping.
- **backend**: `OnboardingFlowService` (orchestrator/state), `WarehouseDiagnosticsService`, `SemanticGenerationService`, `DashboardBuilder`, Graphile tasks ×3, TSOA `OnboardingController`, migration, targeted cached_explore edit model method. `pnpm generate-api` after controller.
- **frontend**: `features/agenticOnboarding/` wizard (details below).

### Deploy strategy
Dark backend endpoints ship first (flag-independent, unreachable from UI); frontend wizard behind `AgenticOnboarding` flag; flag off = classic flow untouched. Additive-only migration. Rollback = flag off; created NONE projects/explores are harmless.

### Failure mode registry (all mitigated)
Auth-ok-no-USAGE → stop at list-schemas + GRANT remedy + retry (re-reads creds, #24219) · raw driver errors → always mapped · introspection overload → ≤5 concurrency, ROW_COUNT metadata, time-box (metabase#8387) · 0 valid metrics → job ERROR actionable + demo hatch · worker crash → ERROR status, idempotent retry, transactional writes · mid-flow drop → resume from state table · dashboard vs toggled-off metric → build reads current layer, skips hidden · **deploy wipes explores → VIRTUAL tag (integration test #1)** · **edit reverted → targeted mutation (integration test #2)** · SSO redirect → post-register lands on wizard.

## Frontend Implementation

- **Lift `FormProvider`** (formContext.ts) above the method switch in the Step-1 sub-flow → all method screens share one form; method switching preserves values; paste pre-fill = `form.setValues()`.
- **Routes:** `/createProject` (step 1; `?warehouse=&method=` params) → `/createProject/:projectUuid/profile` → `/semantic-layer` → `/dashboard`. Step derived from route; `CreateProject.tsx` becomes thin router. Classic flow (incl. `ConnectUsingCLI`) preserved behind flag-off.
- **Components:** NEW `AgenticOnboardingWizard`, `OnboardingStepper` (Mantine v8 Stepper), `ConnectMethodServiceAccount`(key-pair), `ConnectMethodPaste` (auto-detect + mask, secrets stay in browser), `LeastPrivilegeGuidance`+`GrantScriptBlock`, `ConnectionTestChecklist` (Timeline, progressive reveal of real timings), `ConnectionTestDiagnosis` (+"I ran it — retry"), profile screens (banner/tables/entities/relationships), semantic-layer screens (generation checklist, metrics/dims tables w/ inline rename+toggle), dashboard build/ready. Shared: `StepChecklist`, `CopyScriptBlock`, `GeneratedFieldRow`, `TrustNote`. REUSE `SelectWarehouse`, `OnboardingWrapper`, `SnowflakeForm` + `FormSection`/`FormCollapseButton` (Advanced), `OnboardingButton`. MODIFY `SelectConnectMethod` (4 methods easiest-first, migrate v6→v8 imports). CUT: `ConnectMethodPasswordless`, `KeepAliveChoice`.
- **Method registry:** `methodsByWarehouse[WarehouseTypes]` → ordered descriptors; Snowflake full; others fall back to `[manual]` with existing `WarehouseForms/*`.
- **State:** URL (step/warehouse/method) + lifted form (draft) + local state (paste secrets, never networked until submit) + TanStack Query (server state; job polling `refetchInterval: 800` while running). No Redux, no SSE.
- **Demo hatch:** "Explore the demo project" link on signup/warehouse/method screens → seeded demo project.
- **A11y:** focus to step heading on mount; `StepChecklist` `role=status aria-live=polite` (fail=assertive); `aria-current` on stepper; copy announcements; ≥44px touch targets; reduced-motion respected.
- All new code Mantine v8 (`@mantine-8/core`), CSS modules only.

## Backend Implementation

- **Endpoints** (TSOA `OnboardingController`; types in `common/src/types/onboarding.ts`; `projectUuid` typed `UUID`):
  - `POST /api/v1/onboarding/connection/test` — session-only (no API key) — sync → `ConnectionDiagnosticResult{status, checks[]}`
  - `POST /api/v1/onboarding/connection/grant-script` → `{sql}`
  - `POST /projects/{projectUuid}/onboarding/profile|semantic-layer|dashboard` → `{jobUuid}`; matching GETs for results
  - `PATCH /projects/{projectUuid}/onboarding/semantic-layer/fields` (rename/toggle)
  - `GET|PATCH /projects/{projectUuid}/onboarding/state`
- **DB:** `onboarding_project_state(uuid PK, project_uuid FK CASCADE, step, status, result JSONB, updated_at, UNIQUE(project_uuid, step))`; additive-only. Existing org-scoped `onboarding` table untouched.
- **Diagnostics:** ordered checks w/ timing; error map: DNS→account-id hint · 250001→auth failed · empty schemas→"Role X can't see schemas in DB Y"+`GRANT USAGE ON DATABASE` · schema USAGE→`GRANT USAGE ON ALL SCHEMAS` · no SELECT→`GRANT SELECT ON ALL/FUTURE TABLES` · warehouse→`GRANT USAGE ON WAREHOUSE` · network policy→IP allowlist. GRANT generator: `CREATE ROLE LIGHTDASH_ROLE` + read-only grants + future grants + grant-to-user + key attach.
- **Profiling:** ROW_COUNT from metadata (null for views OK); ≤100 tables; ≤5 concurrent getFields; time-boxed. PK=`id`/`<table>_id`; FK=`<other>_id|_key` matching a PK w/ compatible type → many-to-one `sqlOn`, confidence-scored.
- **Generation:** metrics — revenue/amount/price→sum+average, qty→sum, PK→count_distinct, every table→count; non-additive via `getMetricSql`/`getMedianSql` (never client-summed); curated to primary entity + few joins (not all tables). Validation pass before persist.
- **Dashboard:** primary entity = top row count w/ time dim + revenue metric; deltas via two date-range subqueries in one SQL; transactional chart+dashboard writes.
- **AuthZ:** existing scopes only — test/grant-script→`create:Project`; jobs→`manage:CompileProject`(+`view:Project`,`create:Job`); charts/dashboards→enforced in reused create services; no scoped_roles migration.
- **Analytics (REQUIRED):** `step_viewed/step_completed/step_failed/abandoned` + connection-test pass/fail w/ failing-check id.

## Research Context (key citations)
- Snowflake Node driver docs: `externalbrowser` = interactive local-browser only → server-side impossible. External OAuth = correct future passwordless path (needs admin-created security integration).
- GH: #18546 (externalbrowser SAML timeouts), #23924 (PAT accumulation), #19777 (dbt-less UI schema), #12684/#12685 (test-connection button ask), #24219 (stale creds on retry), #25405 (onboarding prompts).
- Metabase X-rays = direct analog for steps 2–4; their #8387 (connection exhaustion) drives our throttling.
- Slack: growth team wants per-step onboarding telemetry; #jess-dev spec'd warehouse test button (only dbt validated today).

## Risk Register (post-adjudication)
| Risk | L | I | Mitigation |
|---|---|---|---|
| ~~Credential-less signup trapped~~ | — | — | RESOLVED: demo hatch in scope (D9) |
| ~~PAT keep-alive broken~~ | — | — | RESOLVED: cut (D2) |
| 2nd/invited user 403 or dup project | MED | MED | entry guard (D8) + tests |
| Missing telemetry | HIGH | MED | required analytics events |
| SSRF/port-scan oracle | MED | MED | accepted (D11); suppress raw socket errors |
| Weak generic metrics ("wall of counts") | MED | MED | curate primary entity; job ERROR on 0 valid |
| Warehouse connection exhaustion | MED | MED | ≤5 concurrency, ROW_COUNT, time-box |
| Edit silently reverted | LOW | HIGH | targeted mutation + mandated test #2 |
| Explores wiped by later deploy | LOW | HIGH | VIRTUAL tag + mandated test #1 |

### Unresolved / follow-on
External OAuth passwordless (needs `PROGRAMMATIC_ACCESS_TOKEN`/OAuth additions to `SnowflakeAuthenticationType` + `sensitiveCredentialsFieldNames`) · BigQuery golden path · full sample-data dataset path · AI enrichment layer · on-call runbook + generation-failure alerting (nice-to-have this iteration) · i18n keys (confirm repo expectation during FE slice).

## Test Strategy (full detail: QA plan, scratchpad/qa-plan.md)

**Acceptance criteria:** per-section checkbox lists (§3 entry+guard, §4 methods/trust/test, §5 profile, §6 semantic+edits, §7 dashboard+math, §9 cross-cutting) — see QA plan Part 1.
**Testability tiers:** PG-local (warehouse-generic: state table, VIRTUAL survival, edit persistence, math accuracy, profile lifecycle) · MOCK (Snowflake error mapping, diagnostics pipeline, generation heuristics) · 🚩SNOWFLAKE-REQ (live diagnoses on mis-granted roles, ROW_COUNT semantics, dialect quoting/median, key-pair auth) — creds arriving during build (D12).
**Mandated integration tests:** (1) VIRTUAL-tag survival across deploy-path `saveExploresToCache` + negative control; (2) rename/toggle persists across reload AND across a subsequent deploy-path save. Both PG-local.
**Math accuracy:** seeded two-period fixture with hand-computed totals — AOV=100 (uneven groups punish wrong impl), unique customers=3 (repeat customer punishes client-side summing: wrong=5), deltas from two ranges in one SQL, top-N + "other" bucket exact.
**Edge cases:** empty schema, 1 table, no numeric/date columns, all-string, unicode/reserved names, null ROW_COUNT views, self-referencing FK, composite keys, >100 tables, dup FKs to same target, concurrent generation, cross-project job access.
**Regression:** ProjectModel/ProjectService/exploreCompiler/SnowflakeWarehouseClient suites; classic flow with flag off; jobs UI renders new JobTypes without breaking dbt deploys; OpenAPI diff after generate-api.

## Implementation Order

### Phase 1: Foundation (backend, dark)
- [ ] Migration `onboarding_project_state` + entity + model — backend — S
- [ ] `common/src/types/onboarding.ts` unified types + `FeatureFlags.AgenticOnboarding` + Job enums — common — S
- [ ] Onboarding state GET/PATCH + controller skeleton + generate-api — backend — S

### Phase 2: Diagnostics engine (dark, curl-testable; live-verify when creds arrive)
- [ ] Snowflake diagnostic checks + error→diagnosis map — warehouses — M
- [ ] `WarehouseDiagnosticsService` + sync test endpoint (session-only) + GRANT-script generator — backend — M
- [ ] Unit tests (mocked client per failure mode) + api-tests (incl. 401-on-ApiKey) — L

### Phase 3: Profile job (dark; testable on local PG)
- [ ] Graphile task + ROW_COUNT introspection + caps/time-box — backend/warehouses — M
- [ ] Entity/relationship inference heuristics + fixtures — backend — M
- [ ] Profile endpoints + JobSteps — backend — S

### Phase 4: Generator + dashboard builder (dark; PG-local math tests)
- [ ] `SemanticGenerationService` → compileExplore → VIRTUAL-tagged saveExploresToCache + validation — backend — L
- [ ] Targeted cached_explore edit mutation + PATCH endpoint — backend — M
- [ ] **Mandated integration tests #1 and #2** — backend — M
- [ ] `DashboardBuilder` (KPI deltas via query layer, transactional) + math-accuracy fixture tests — backend — L

### Phase 4b: CLI-assisted SSO bridge (D2b; backend+CLI dark, frontend screen lands in Phase 5)
- [ ] One-time-code mint endpoint (session-only) + code store w/ TTL — backend — M
- [ ] Credential-deposit endpoint (authenticated by one-time code; stores PAT via existing encrypted creds path; `PROGRAMMATIC_ACCESS_TOKEN` auth type if needed) — backend/common — M
- [ ] CLI command: `lightdash connect snowflake --code <otc>` → externalbrowser SSO → named scoped PAT (reuse/rotate per #23924) → deposit — cli — M
- [ ] Wizard method screen: copy-paste npx commands + polling for credential arrival — frontend (in Phase 5) — M

### Phase 5: Frontend wizard (behind flag)
- [ ] Wizard shell + stepper + routes + entry guard + demo hatch — frontend — M
- [ ] Step 1: method screens (lifted form, paste auto-detect, GRANT block, test checklist + diagnosis + retry) — frontend — L
- [ ] Steps 2–4: profile/semantic/dashboard screens + job polling + inline edits — frontend — L
- [ ] Analytics events (FE+BE) + a11y pass — both — M

### Phase 6: Verification & rollout
- [ ] Live Snowflake battery (4 🚩 areas) — needs creds — M
- [ ] E2E happy path + entry-guard + SSO-redirect + fail→diagnose→retry — e2e — M
- [ ] Regression suite + flag-off classic-flow manual pass — M
- [ ] Flag rollout → (later) flag removal
