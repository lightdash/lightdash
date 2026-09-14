# Autopilot AI SDK rollout

The AI SDK runner is opt-in while provider acceptance is being evaluated. Keep the hosted runtime, credentials and columns available for rollback during this phase.

## Configuration and attribution

Set `MANAGED_AGENT_RUNTIME=ai-sdk` on both the API and scheduler processes. The default remains `anthropic-managed`. Restart both processes after changing deployment configuration; they must agree on the runtime.

Autopilot resolves the organization's AI configuration before enabling and again for each run. It uses a visible, available organization default model, then an available configured provider default, then an available model. Azure uses its configured deployment directly. Configuration preflight constructs the model; it does not make a paid request or prove that a credential can access the deployment. Disabling a provider or hiding all models can prevent the next run.

Setup and the activity header show the current provider, model and whether the key comes from organization settings or the instance. The project-admin-only `/managed-agent/runtime` endpoint resolves this independently of saved settings, including before Autopilot is enabled, and reports key management separately from key origin. Each run saves `model_provider` and `model_name` before model execution, so a provider failure or later configuration change does not erase its attribution. Historical runs without a recorded model remain unknown; no backfill guesses from current settings. Each completed or interrupted model loop also includes attribution in its stored summary. Usage telemetry includes the run UUID, project, organization, provider, model and key management. Scheduled runs can make multiple calls and incur token charges on that key.

`MANAGED_AGENT_VALIDATED_MODELS` is a JSON array of exact `{ "provider", "model", "mode" }` qualifications. `mode` is `observe`, `flag` or `cleanup`. The default is `[]`: no model is qualified for flagging or deletion. Record a reviewed scorecard before adding an entry. Use the provider and model IDs reported by runtime attribution, including Azure deployment names and Bedrock inference-profile prefixes. Qualification does not transfer to a different model, deployment or provider.

The runner uses the lower of the requested mode and the model's qualified mode. Duplicate entries use the most restrictive mode. Malformed configuration rejects startup. Changes require an API/scheduler restart and apply deployment-wide. This is model qualification configuration; it neither enables the Autopilot feature nor grants project access.

A downgrade is a notice, not a run error. It appears in setup, the run summary on the activity page, and Slack when configured. Observe mode disables cleanup flagging and deletion; existing chart creation and repair capability settings still apply. Reversing a prior creation cannot bypass the deletion restriction. Restoring previously deleted content remains available.

## Execution guarantees

- Action callbacks execute sequentially within a run, preserving count/check/write guards such as the delete cap.
- The deadline cancels model requests, prevents queued actions starting, and interrupts query polling. An unfinished warehouse query is sent through the existing cancellation service.
- Cancellation is cooperative: a content write already in progress must settle with its action bookkeeping before the run finishes. The wall-clock deadline is not a guarantee that arbitrary database or warehouse operations stop immediately.
- Step cap, timeout, truncation, content filtering and provider failures produce an error outcome. A summary captured before failure is retained.
- Content discovery receives the allowed space UUIDs. Empty scope is denied before shared tools, where an empty UUID array otherwise means unrestricted.
- The chart skill uses Autopilot's actual discovery/create/fix tools and reuses compatible built-in chart references.

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

## Release sequence and rollback

1. Ship the opt-in runner and hardening. Exercise targeted instances with known credentials, retained hosted configuration and recorded results.
2. Switch the default only after the acceptance matrix, deployment configuration and operator docs are ready. Observe real scheduled runs before expanding rollout. During this phase, rollback uses `MANAGED_AGENT_RUNTIME=anthropic-managed` with the retained hosted credentials and resources.
3. Remove the hosted client in a later release after the rollback window closes and all instances have moved. Removing the client also removes this configuration-only rollback path.
4. Retire hosted resources and service-account credentials while their stored attribution still exists. Inventory agent/environment/vault IDs and resolve each stored Autopilot token to its exact service account and project grants. A description/name prefix is candidate discovery, not sufficient proof to revoke an account. Keep a dry-run inventory, verify ownership, revoke only confirmed credentials, and record unresolved resources. Never print tokens or encrypted credential values in reports.
5. Drop stored hosted columns only after retirement is complete and no application or maintenance code reads them. Check upgrade compatibility across the supported release boundary. A failed release-safety check must be explained and resolved; elapsed time alone is insufficient, and a breaking-change declaration is not a substitute for compatibility evidence.

Cloud deployment changes, external resource revocation, client removal and column deletion are later release operations, not effects of enabling this opt-in code.
