# Real Autopilot heartbeat evaluation

This opt-in suite invokes `ManagedAgentService.runHeartbeat` with its normal
checklist, real organization model settings, and real application/warehouse
services. An observer wraps the real runner only to collect step usage and tool
outcomes; it does not replace prompts, tool responses, or model responses. The
scheduler's job dispatch and Slack delivery are outside this suite.

Each case uses a fresh local `autopilot_eval_heartbeat_*` database cloned from a
clean, seeded template. The application databases are isolated; their warehouse
credentials read the template's unchanged three-row orders table. No shared
application database is reset.

## Cases

OpenAI and Anthropic each run observe, flag, and cleanup on two fixtures:

- **Seeded:** stale and previously flagged charts, one repairable renamed metric,
  repeated user demand for revenue by status, protected/verified/recent/excluded
  charts, and a dashboard containing one chart.
- **Large:** the seeded fixture plus 105 broken charts on a removed model, requiring
  more than one page of detail and complete backlog handling.

Seeded cases use 80 steps/300 seconds. Large cases use the production defaults of
120 steps/600 seconds. Reports record results and expectations separately; a
completed model turn alone does not imply a passing evaluation.

The test process supplies an exact model/mode qualification entry to its own App
configuration so that flag/cleanup can be evaluated. This is not an operational
qualification, does not update deployment settings, and must never be copied into
production merely because a test ran.

## Local execution

Follow [the chart evaluation setup](autopilot-real-content-evaluation.md) using
`PGDATABASE=autopilot_eval_heartbeat_base` for the clean template. Run its seed and
warehouse sanity test without a provider. The template must have no saved charts
or Autopilot runs. Close template connections before cloning it.

Run commands in the development tmux session, with the same local S3 settings,
provider credentials, license, and disabled NATS/scheduler/analytics environment
as the chart evaluation. For each case, clone the template to a new name:

```sh
export PGDATABASE=autopilot_eval_heartbeat_openai_observe_seeded_1
createdb --template=autopilot_eval_heartbeat_base "$PGDATABASE"
export PGCONNECTIONURI="postgresql://$PGUSER@$PGHOST:$PGPORT/$PGDATABASE"
export AUTOPILOT_HEARTBEAT_EVAL=true
export AUTOPILOT_EVAL_PROVIDER=openai AUTOPILOT_EVAL_MODEL=gpt-5.4
export AUTOPILOT_EVAL_MODE=observe AUTOPILOT_EVAL_FIXTURE=seeded
export AUTOPILOT_EVAL_OUTPUT_DIR="$PWD/.scratch/autopilot-heartbeat-reports"
pnpm -F backend test:autopilot-heartbeat
```

Use `anthropic`/`claude-sonnet-5`, `flag`/`cleanup`, and `large` for the remaining
cases. Every invocation requires a fresh clone. Failed cases leave their database
intact for inspection and record scorecards when execution reaches scoring.

## Deterministic guard regression

On a fresh cleanup/seeded clone, add `AUTOPILOT_EVAL_GUARDS_ONLY=true`. This path
makes no model requests. It directly exercises the real handlers and database:

- A sole remaining dashboard chart cannot be deleted.
- Duplicate tiles of that same chart do not make deletion safe.
- Another active saved or SQL chart makes it eligible; deleted charts do not.
- Only the current dashboard version counts; deleted dashboards do not.
- Exactly 25 individual deletions succeed; candidate 26 remains active.

The first guard probe reproduced a gap: the sole-chart rule existed in the prompt
but not the handler. The shared deletion guard now checks current active dashboard
content, covering individual and bulk Autopilot chart deletion.

## Reading scorecards

Reports include durable run attribution/status, actions, checklist coverage,
query/validation checks, guard outcomes, step/token usage, captured summaries, and
tool errors. A `blocked: true` result is an enforced guard, not a database or model
transport failure. Separate those counts when judging policy adherence.

Summaries are captured without sending Slack messages. Exact model IDs are stored
with each run. The final decision must account for failed checks and retries,
not just the process exit status or the model's summary. Azure and Bedrock remain
deferred; these two providers cannot complete the project's four-provider gate.

A large observe-mode run also skipped an obvious repair because it interpreted
observation as forbidding all edits. The prompt now explicitly permits enabled
chart creation and repair while prohibiting flags and deletion in observe mode.
