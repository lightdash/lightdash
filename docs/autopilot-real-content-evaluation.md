# Autopilot real chart evaluation

This opt-in evaluation calls a paid provider and creates real application content
in a dedicated local PostgreSQL database. It uses the actual App repositories,
actor permissions, semantic discovery, skills, query execution, chart writes,
validation, protections, and action history. It does not mock tool responses.

The task prompt deliberately narrows the normal heartbeat to one chart repair and
one requested creation. Passing this test does not qualify the whole maintenance
checklist, cleanup mode, production-scale projects, Azure, or Bedrock. It does not
exercise organization model selection or the heartbeat scheduler. Summaries are
captured but never delivered to Slack.

## Fixture and assertions

The warehouse contains three synthetic orders, with revenue 25, 50, and 75.
One big-number chart references the retired `orders_total_amount` metric; its
replacement is `orders_total_revenue`. Two other broken charts are protected and
outside the selected space scope, respectively.

The model must load chart resources, discover fields, query the warehouse, repair
the eligible chart, and create a table of revenue by status in Agent Suggestions.
The test independently validates and executes both saved charts: total revenue
must be 150; status totals must be `new=25`, `paid=125`. It checks repair history,
preserved description/label, the creation's slug and restricted suggestions space,
and unchanged versions after direct protected/out-of-scope repair probes.
Malformed create/repair probes verify that missing filters are rejected before
chart mutation or action creation.

## Local setup

Use a development license, provider credentials, and working local S3/MinIO
settings. Disable analytics delivery. Run migrations, dbt, and the evaluation
through the development tmux session. Do not point this at an existing application
database. The test refuses nonlocal databases and names outside `autopilot_eval_*`.

From the repository root, after loading development credentials:

```sh
export PGHOST=127.0.0.1 PGPORT=5432 PGUSER="$(whoami)" PGPASSWORD=''
export PGDATABASE=autopilot_eval_chart_workflow
export PGCONNECTIONURI="postgresql://$PGUSER@$PGHOST:$PGPORT/$PGDATABASE"
export DBT_DEMO_DIR="$PWD/packages/backend/src/ee/services/ManagedAgentService/content-eval"
export DBT_PROJECT_DIR="$DBT_DEMO_DIR/dbt"
export DBT_PROFILES_DIR="$DBT_DEMO_DIR/profiles"
export DBT_PROFILE=autopilot_eval DBT_TARGET=dev
export NATS_ENABLED=false SCHEDULER_ENABLED=false USAGE_EVENTS_ENABLED=false
export RUDDERSTACK_ANALYTICS_DISABLED=true
export MANAGED_AGENT_RUNTIME=ai-sdk LIGHTDASH_ENABLE_FEATURE_FLAGS=ai-autopilot
createdb
pnpm -F backend migrate
# dbt1.12 must be on PATH (the development seed uses that executable).
dbt1.12 run --project-dir "$DBT_PROJECT_DIR" --profiles-dir "$DBT_PROFILES_DIR" --profile autopilot_eval
AUTOPILOT_CONTENT_EVAL=true AUTOPILOT_CONTENT_SEED=true \
  pnpm -F backend test:autopilot-content
```

The seed flag initializes the empty database using the standard development actor,
project, and cached-explore seed. Omit it on subsequent runs. Every provider run
creates uniquely named chart/space fixtures; records remain in this isolated
database for inspection.

```sh
export AUTOPILOT_CONTENT_EVAL=true
export AUTOPILOT_EVAL_OUTPUT_DIR="$PWD/.scratch/autopilot-content-reports"
AUTOPILOT_EVAL_PROVIDER=openai AUTOPILOT_EVAL_MODEL=gpt-5.4 \
  pnpm -F backend test:autopilot-content
AUTOPILOT_EVAL_PROVIDER=anthropic AUTOPILOT_EVAL_MODEL=claude-sonnet-5 \
  pnpm -F backend test:autopilot-content
```

Reports contain synthetic action records, summary text, skill names, step/token
counts, and tool errors. They contain no credentials or raw provider requests.
The test result is authoritative for persisted-content assertions; inspect both
the report and Vitest outcome before claiming a pass.

## Recorded result

[2026-09-14 scorecard](evals/autopilot-real-content/2026-09-14/README.md): OpenAI
and Anthropic passed the focused workflow. This run found and fixed missing-filter
validation before database writes. Full qualification remains pending.
