# Autopilot AI SDK rollout

Autopilot runs on the AI SDK. The hosted runtime has been removed; rollback now requires restoring an earlier application release. Stored hosted resource identifiers remain temporarily for retirement.

## Configuration and attribution

`MANAGED_AGENT_RUNTIME` no longer selects a runtime. Restart both API and scheduler processes after changing provider or qualification configuration; they must use the same configuration.

Autopilot resolves the organization's AI configuration before enabling and again for each run. It uses a visible, available organization default model, then an available configured provider default, then an available model. Azure uses its configured deployment directly. Configuration preflight constructs the model; it does not make a paid request or prove that a credential can access the deployment. Disabling a provider or hiding all models can prevent the next run.

Setup and the activity header show the current provider, model and whether the key comes from organization settings or the instance. The project-admin-only `/managed-agent/runtime` endpoint resolves this independently of saved settings, including before Autopilot is enabled, and reports key management separately from key origin. Each run saves `model_provider` and `model_name` before model execution, so a provider failure or later configuration change does not erase its attribution. Historical runs without a recorded model remain unknown; no backfill guesses from current settings. Each completed or interrupted model loop also includes attribution in its stored summary. Usage telemetry includes the run UUID, project, organization, provider, model and key management. Scheduled runs can make multiple calls and incur token charges on that key. Per-call events carry `managedAgentRunId` (the internal stream column is `managed_agent_run_id`); run-completed events carry the provider, model and key management captured at model selection, including provider failures. Schedules multiply usage per project. Token totals require a provider price catalog or invoice reconciliation before they can be reported as dollar cost.

`MANAGED_AGENT_VALIDATED_MODELS` is a JSON array of exact `{ "provider", "model", "mode" }` qualifications. `mode` is `observe`, `flag` or `cleanup`. When the variable is unset, the built-in list in `packages/backend/src/config/autopilotConfig.ts` applies: `anthropic/claude-opus-5`, `anthropic/claude-opus-4-8`, `anthropic/claude-opus-4-7`, `anthropic/claude-sonnet-5`, `bedrock/anthropic.claude-opus-5`, `bedrock/anthropic.claude-opus-4-7`, `bedrock/anthropic.claude-sonnet-5` (Bedrock ids are matched with or without the region prefix), `openai/gpt-5.6-sol`, `openai/gpt-5.5-2026-04-23` and `openai/gpt-5.4-2026-03-05`, all qualified for `cleanup`. Claude Opus 4.7, Claude Sonnet 5 on Anthropic and GPT-5.4 passed the heartbeat acceptance matrix; the newer entries were added as successors of those models without a separate matrix run. On Anthropic and Bedrock, Autopilot prefers the newest Claude Opus the organisation may use over its chat default, and keeps an Opus the organisation chose itself (`AUTOPILOT_PREFERRED_MODELS` in `modelSelection.ts`); other providers follow the organisation default. Autopilot requests the highest reasoning effort the provider SDK exposes (`xhigh` on adaptive Anthropic and Bedrock models, a 16k thinking budget on older budget-style models). Setting the variable replaces that list rather than extending it, so an operator can widen it (an Azure deployment, a Bedrock inference profile) or narrow it (`[]` or an empty string qualifies nothing, and every project runs in observe mode). Record a reviewed scorecard before adding an entry, in code or in the variable. Use the provider and model IDs reported by runtime attribution, including Azure deployment names and Bedrock inference-profile prefixes. Qualification does not transfer to a different model, deployment or provider.

The runner uses the lower of the requested mode and the model's qualified mode. Duplicate entries use the most restrictive mode. Malformed configuration rejects startup. Changes require an API/scheduler restart and apply deployment-wide. This is model qualification configuration; it neither enables the Autopilot feature nor grants project access.

A downgrade is a notice, not a run error. It appears in setup, the run summary on the activity page, and Slack when configured. Observe mode disables cleanup flagging and deletion; existing chart creation and repair capability settings still apply. Reversing a prior creation cannot bypass the deletion restriction. Restoring previously deleted content remains available.

## Execution guarantees

- Action callbacks execute sequentially within a run, preserving count/check/write guards such as the delete cap.
- The deadline cancels model requests, prevents queued actions starting, and interrupts query polling. An unfinished warehouse query is sent through the existing cancellation service.
- Cancellation is cooperative: a content write already in progress must settle with its action bookkeeping before the run finishes. The wall-clock deadline is not a guarantee that arbitrary database or warehouse operations stop immediately.
- Step cap, timeout, truncation, content filtering and provider failures produce an error outcome. A summary captured before failure is retained.
- Content discovery receives the allowed space UUIDs. Empty scope is denied before shared tools, where an empty UUID array otherwise means unrestricted.
- The chart skill uses Autopilot's actual discovery/create/fix tools and reuses compatible built-in chart references.
- The stored run summary and the Slack report are rendered from saved actions. The model's `write_slack_summary` note only ends its turn and is never published.

## Live evaluation suites

`pnpm -F backend test:autopilot` runs the opt-in suites under `vitest.autopilot.config.ts`. Each suite skips unless its environment variables are set, makes paid model calls, and uses real fetch (the unit-test setup stubs fetch and must not be used for live provider tests). Results and go/no-go decisions are recorded on PROD-11224, not in the repository; `AUTOPILOT_EVAL_OUTPUT_DIR` writes per-run JSON scorecards locally.

### Provider smoke

Load development provider configuration into the shell without printing credentials, then run:

```sh
AUTOPILOT_EVAL_PROVIDER=openai \
AUTOPILOT_EVAL_OUTPUT_DIR=/tmp/autopilot-evals \
pnpm -F backend test:autopilot
```

Supported test providers: `openai`, `anthropic`, `bedrock`, `azure`. `AUTOPILOT_EVAL_MODEL` optionally selects the model (Azure uses the configured deployment).

This runs against a synthetic empty-project fixture. It exercises real action schemas and observe/flag/cleanup loops, but performs no application writes. Passing this smoke is **not cleanup qualification**.

### Context benchmark

`AUTOPILOT_EVAL_SCENARIO=context` replaces the empty fixture with a synthetic project of 350 broken charts and 12 stale dashboards, built from the real validation grouping and tool serialisers. Two shapes are exercised: `shared-model` (12 errors per chart on one model, hitting every per-item cap) and `many-models` (one error per chart across 350 models, exercising the uncapped group list). Each case uses at most 12 steps, a 90 second deadline and no provider retries, and makes no application or warehouse writes.

`AUTOPILOT_EVAL_SCENARIO=pagination` instead checks that the model follows `next_cursor` through four detail pages of 350 charts and sees each chart exactly once.

The per-step report records input/output tokens, cumulative input tokens and tool-result bytes. Peak per-call input is the prompt footprint; cumulative input sums every call and must not be compared with a context window. `get_broken_content` returns every root-cause group, so group count and error strings still grow with the project; only samples, detail pages and per-item errors are capped. Decide on compaction from representative full-checklist runs, not from this intake pass.

### Real chart workflow

`AUTOPILOT_CONTENT_EVAL=true` runs one chart repair and one chart creation through the real services against a dedicated local PostgreSQL database and the three-row `content-eval` dbt fixture next to the service. The test refuses non-local databases and names outside `autopilot_eval_*`; never point it at an existing application database.

```sh
export PGDATABASE=autopilot_eval_chart_workflow
export PGCONNECTIONURI="postgresql://$USER@127.0.0.1:5432/$PGDATABASE"
export DBT_DEMO_DIR="$PWD/packages/backend/src/ee/services/ManagedAgentService/content-eval"
export DBT_PROJECT_DIR="$DBT_DEMO_DIR/dbt" DBT_PROFILES_DIR="$DBT_DEMO_DIR/profiles"
export DBT_PROFILE=autopilot_eval DBT_TARGET=dev
export NATS_ENABLED=false SCHEDULER_ENABLED=false USAGE_EVENTS_ENABLED=false RUDDERSTACK_ANALYTICS_DISABLED=true
export LIGHTDASH_ENABLE_FEATURE_FLAGS=ai-autopilot
createdb && pnpm -F backend migrate
dbt run --project-dir "$DBT_PROJECT_DIR" --profiles-dir "$DBT_PROFILES_DIR" --profile autopilot_eval
AUTOPILOT_CONTENT_EVAL=true AUTOPILOT_CONTENT_SEED=true AUTOPILOT_EVAL_PROVIDER=openai pnpm -F backend test:autopilot
```

`AUTOPILOT_CONTENT_SEED=true` seeds the empty database with the standard development organisation, project and cached explores; omit it on later runs. The test executes the persisted charts and asserts their results (total revenue 150; `new=25`, `paid=125`), checks version history and the restricted suggestions space, and probes that protected and out-of-scope charts are refused. Passing it does not qualify cleanup mode or any provider.

### Full heartbeat

`AUTOPILOT_HEARTBEAT_EVAL=true` runs the unmodified heartbeat checklist through the real services with real organisation model settings, observing step usage and tool outcomes without replacing prompts or responses. Scheduler dispatch and Slack delivery stay outside the suite. Each case needs a fresh database cloned from a clean, seeded `autopilot_eval_heartbeat_base` template prepared with the chart workflow setup above (no saved charts or Autopilot runs; close template connections before cloning).

```sh
export PGDATABASE=autopilot_eval_heartbeat_openai_observe_seeded_1
createdb --template=autopilot_eval_heartbeat_base "$PGDATABASE"
export PGCONNECTIONURI="postgresql://$USER@127.0.0.1:5432/$PGDATABASE"
AUTOPILOT_HEARTBEAT_EVAL=true AUTOPILOT_EVAL_PROVIDER=openai AUTOPILOT_EVAL_MODEL=gpt-5.4 \
AUTOPILOT_EVAL_MODE=observe AUTOPILOT_EVAL_FIXTURE=seeded pnpm -F backend test:autopilot
```

`AUTOPILOT_EVAL_MODE` is `observe`, `flag` or `cleanup`. `AUTOPILOT_EVAL_FIXTURE=seeded` has stale and previously flagged charts, one repairable renamed metric, repeated user demand for revenue by status, protected, verified, recent and excluded charts, and a dashboard with one chart; `large` adds 105 broken charts on a removed model so detail runs past one page (flag mode expects all 105 flagged, cleanup expects 25 bulk deletions and an 80-chart backlog). Seeded cases use 80 steps and 300 seconds; large cases use the production defaults. The test supplies its own exact model qualification entry so flag and cleanup can be evaluated; that is never an operational qualification.

`AUTOPILOT_EVAL_GUARDS_ONLY=true` on a cleanup clone makes no model calls and exercises the real deletion handlers directly: the sole chart on a dashboard is protected (duplicate tiles do not make it eligible, another active saved or SQL chart does, only the current dashboard version counts), exactly 25 individual deletions succeed, and repeated bulk calls delete 25 charts in total.

`AUTOPILOT_EVAL_BACKLOG_GUARDS_ONLY=true` on a flag/large clone likewise makes no model calls: it flags the 105 removed-model charts in one group operation, retries without duplicate flags or escalation resets, checks excluded, protected and verified content, refuses observe-mode flagging and cancelled calls, resumes after a mid-group interruption, and records a project insight without a model-supplied target.

## Acceptance before switching the default

Run each promised provider in all three modes on both a seeded project and a representative large/broken project. Use isolated, disposable content. Do not reset a shared developer or customer database to obtain fixtures.

Record for every exact provider/model pair:

1. Expected versus actual stale flags, repairs, chart creations and insights.
2. Protected, verified, recent, selected/excluded-space and escalation-window cases; attempts competing for the last delete-cap slot; reversal behavior.
3. Invalid field references, malformed create/fix input, wrong tool names and guard refusals.
4. Model-call and in-tool timeout, retry/transport failures, step-cap termination and preserved action/summary bookkeeping.
5. Token usage, maximum context growth, steps and wall time. Set compaction policy from representative results, not empty fixtures.
6. Slack accuracy and tone, durable run attribution, effective cleanup mode and notices.

Write a go/no-go decision per model and mode. Azure and Bedrock need their own configured environments. Other resolvable providers, including Google and OpenRouter, remain unqualified until equivalent evidence exists. Fix schema or prompt failures before adding qualifications.

## Migration sequence and rollback history

1. Ship the opt-in runner and hardening. Exercise targeted instances with known credentials, retained hosted configuration and recorded results.
2. Switch the default only after the acceptance matrix, deployment configuration and operator docs are ready. Observe real scheduled runs before expanding rollout. During this phase, rollback uses `MANAGED_AGENT_RUNTIME=anthropic-managed` with the retained hosted credentials and resources.
3. Remove the hosted client in a later release after the rollback window closes and all instances have moved. Removing the client also removes this configuration-only rollback path.
4. Retire hosted resources and service-account credentials while their stored attribution still exists. Inventory agent/environment/vault IDs and resolve each stored Autopilot token to its exact service account and project grants. A description/name prefix is candidate discovery, not sufficient proof to revoke an account. Keep a dry-run inventory, verify ownership, revoke only confirmed credentials, and record unresolved resources. Never print tokens or encrypted credential values in reports.
5. Drop stored hosted columns only after retirement is complete and no application or maintenance code reads them. Check upgrade compatibility across the supported release boundary. A failed release-safety check must be explained and resolved; elapsed time alone is insufficient, and a breaking-change declaration is not a substitute for compatibility evidence.

External resource revocation and column deletion remain separately gated release operations. The sequence above documents the migration stages; the configuration-only rollback in stages 1–2 is unavailable after client removal.
