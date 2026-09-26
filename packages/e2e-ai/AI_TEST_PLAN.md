# AI test plan

> This is the original specification, kept as written. Implementing it found
> assertions that could not hold and preconditions that were wrong; the tests,
> and the correction notes in `README.md`, are the current truth. Read this for
> intent, not for what to run.

Manual Playwright suite for Lightdash's AI features. This document is the
suite: nothing here is implemented. It is written so a reviewer can judge
whether the coverage is right, not to look exhaustive.

Ground rules are in `README.md`. The ones that shape every test:

- The operator starts the backend and configures the providers. No test picks,
  switches or asserts a provider or model. Whatever is configured is under test.
- Feature flags are all on.
- Dashboard summaries are out of scope.

Two more rules this plan adds:

- **Every test asserts on a ledger, not on prose.** The ledger is what the
  feature writes regardless of wording: database rows, tool-call records,
  query history, schema-shaped API responses, the `ai.usage` log line. Model
  text is never compared against expected text.
- **Every test says how to tell a real failure from model variance.** A test
  that cannot say that is not in the plan.

## 1. What is hard about testing this, and how each test copes

| Difficulty | Technique used in this plan | Where |
|---|---|---|
| Non-deterministic output | Assert structure (zod-shaped responses), invariants (generated SQL executes, artifact is queryable, tokens > 0), and persisted side effects. Steer tool choice with per-fixture agent instructions rather than hoping. Compare against documented fallback constants, because three features silently fall back when the model fails. | all tiers |
| Streaming | Wait for the `POST .../stream` response to finish (`waitForResponse` then `response.finished()`), then assert DOM end state (working indicator gone, send button back) and the DB terminal row (`ai_prompt.responded_at`). The SSE body can be captured with `response.text()` to assert chunk *kinds*, never chunk contents. | T2.2, T2.3, T2.4 |
| Long-running work | No runtime estimates and no bounds: a run takes as long as it takes, at whatever limits the org has configured. What is detected is a *hung* run, through a progress watchdog: while a run is non-terminal, its progress signal (`updated_at`, an event count, a status timestamp) must keep advancing; a run whose signal stops advancing is failed as hung. That is a statement about progress, not about duration. | T5.3, T6.1, T8.2, T8.5 |
| Tool calls that hit the warehouse | Seeded Jaffle Shop Postgres project only. Join `ai_agent_tool_result.metadata->>'queryUuid'` to `query_history` (`context = 'ai'`) to prove the query ran and succeeded. Cache hits are fine and are recorded in the same metadata. | T2.1, T2.3, T2.4, T6.1 |
| Ambient work that fires after another action | Three shapes, three waits: in-process fire-and-forget (poll the DB column until it is set, giving up only once the feature's own abort window in code has passed); Graphile job (poll `scheduler_log` or `GET /api/v1/schedulers/job/{jobId}/status` until the job is terminal); debounced or delayed job (force it through the endpoint that exists, or mark opt-in). | T1.4, T1.5, T2.6, T3.1, T7.1 |
| Features that only show in telemetry or the DB | Two different questions. *Did the model call happen and consume tokens?* is answered from Postgres: `ai_prompt.token_usage` (jsonb `{ totalTokens, finalStepTotalTokens }`) for every agent turn, and the per-run breakdown on `ai_deep_research_runs` (`input_tokens`, `output_tokens`, `total_tokens`, `cache_read_tokens`, `cache_write_tokens`, `reasoning_tokens`, `token_usage_complete`). Those assertions need no log file and are on by default. *Was the call attributed correctly?* (feature, provider, model, keyManagement, org, project, agent) is only visible in the `AI usage:` info log line that `emitAiUsage` writes, or in an OTel span; Postgres does not carry those dimensions. Only that narrow check reads the backend log the operator points at (`E2E_AI_BACKEND_LOG`) and is skipped, reported, never faked, when unset. | T2.1, T3.1, T6.1 (Postgres); T0.2, T2.1, T5.1, T8.1, T8.2 (log, attribution only) |
| Fire-with-no-click triggers | Chart metadata fires on *hover* of Save; formula table calculation preview fires on debounced *typing*; thread title fires on thread creation. Tests either trigger them deliberately or block the request so it cannot pollute another assertion. | T1.1, T1.3, T1.4 |

## 2. Environment the operator provides

| Item | Value or requirement |
|---|---|
| Backend | Started by the operator. `AI_COPILOT_ENABLED=true`, one provider configured. `SCHEDULER_ENABLED` left at its default (`true`) so ambient jobs run in the same process. |
| Optional env, per tier | `AI_AGENT_PROMPT_INPUT_REQUEST_CLASSIFIER_ENABLED=true` (T2.6). `AI_EMBEDDING_ENABLED=true` (T3.1 embedding half). `MCP_ENABLED=true` (T8.3, T8.4). `SANDBOX_PROVIDER=docker` plus app-runtime S3/MinIO (T5.3). |
| Attribution witness | `E2E_AI_BACKEND_LOG=<path>`: a file receiving the API process stdout (`pnpm -F backend dev \| tee`, or the pm2 log file). Used only for the attribution dimensions of the `AI usage:` line (feature, provider, model, keyManagement, org, project, agent). Token consumption is asserted from Postgres and does not need it. Unset means the attribution assertions are skipped and reported, never faked. Maple at `http://localhost:4320` is an optional alternative witness. |
| Optional CLI | Claude Code installed and signed in on the operator machine, for T8.7 only. That test is a subprocess test, not a Playwright test. |
| Database | `./scripts/reset-db.sh` before a full run. Tests read Postgres directly through `PGDATABASE`/`DATABASE_URL`; the same connection the backend uses locally. |
| Users | `demo@lightdash.com` / `demo_password!` (org admin). Seed PAT `SEED_PAT` from `@lightdash/common` (`ldpat_deadbeef…`) for `Authorization: ApiKey`. |
| Project | `SEED_PROJECT` (Jaffle shop, Postgres warehouse). Explores `orders`, `customers`, `payments` are the witness explores; preflight verifies they exist. |
| Base URL | `SITE_URL`, default `http://localhost:3000`. |
| Playwright | The backend's `playwright@1.56.1`, cached Chromium, one worker, serial. Login once through `POST /api/v1/login`; reuse the cookie jar for `request` and `page` (storage state). |
| Selectors | Role, label and text based, plus the `data-testid` and `data-tour-anchor` attributes that already exist. No new test ids are assumed; the plan does not make a product change a precondition. Role and label selection on the composer, approval card and suggestion chips is the main flake source and is accepted. |

## 3. Fixtures created per run

All fixtures carry a run id in their name and are deleted at the end
(`DELETE /api/v1/projects/{p}/aiAgents/{agentUuid}` cascades threads, prompts,
artifacts, tool calls).

| Id | Fixture | Purpose |
|---|---|---|
| F1 | Agent `e2e-ai-<run>`: `enableDataAccess: true`, `enableSqlMode: true`, `enableContentTools: false`, no tags, short neutral instruction. | Default agent. Content tools off keeps `generateDashboard` and `getDashboardCharts` in the tool set. |
| F2 | Agent `e2e-sql-first-<run>`: as F1 plus instruction "Answer every data question by running SQL with the `runSql` tool. Do not use other query tools." | Forces the raw SQL path for T2.4. |
| F3 | Agent `e2e-asks-back-<run>`: as F1 plus instruction "End every reply with one short clarifying question ending in a question mark." | Trips the classifier's regex pre-gate deterministically in T2.6. |
| F4 | Router pair `e2e-revenue-<run>` (instruction and description about payments and revenue) and `e2e-customers-<run>` (about customer profiles). | T4.1. |
| F5 | Playground project through `POST /api/v1/org/playground-projects/ensure`. DuckDB, no external warehouse. Seeds the "Jaffle analyst" agent, three charts, a dashboard, the "Jaffle pulse" data app (ready version only when app-runtime S3 is configured) and a finished deep research thread. | T5.2, T6.3. Idempotent, so it can be reused across runs. |
| F6 | Witness prompts: `How many orders are there in total?`, `Show a bar chart of the number of orders by status`, `Using SQL, count the rows in the orders table`, `Which customer placed the most orders?`. | Chosen so the cheapest correct path is one warehouse query on a seeded explore. |
| F7 | A tiny markdown document (three paragraphs about "return policy definitions"). | T1.6. |

## 4. Run order

Cheapest and most diagnostic first. A failure in tier 0 or 1 stops the run:
nothing later can be trusted. Tier letters: **D** deterministic, **V**
variance-prone (retry once allowed), **O** opt-in (needs extra setup).

| Order | Test | Feature | Kind | SDK 7 surface it exercises |
|---|---|---|---|---|
| 0 | T0.1 | Preflight: AI on, explores present, fixture agent | D | none |
| 0 | T0.2 | Tooltip generation (smallest model round trip) | D | `Output.object`, telemetry line |
| 1 | T1.1 | Chart metadata on Save hover | D | `Output.object`, system message in `messages` |
| 1 | T1.2 | Custom dimension generation, then the SQL runs | V | `Output.object` |
| 1 | T1.3 | Table calculation (SQL and formula) | V | `Output.object` |
| 1 | T1.4 | Thread title | D | `Output.object`, message order fix |
| 1 | T1.5 | Suggestion chips, empty state and post-response | D | `Output.object`, `extra` attribution |
| 1 | T1.6 | Document summary on upload | D | `Output.object` |
| 1 | T1.7 | Chart similarity for review requests | D | `Output.object`, `system` + `prompt` |
| 2 | T2.1 | Non-streaming answer with a warehouse query (API) | V | `generateText` tools, `AgentContext`, telemetry |
| 2 | T2.2 | Streaming answer in the browser | V | `streamText`, `onChunk` switch, timing |
| 2 | T2.3 | Visualization artifact | V | `runQuery` tool context, artifacts |
| 2 | T2.4 | Raw SQL with approval card, and auto-approve | V | `runSql`, approval polling |
| 2 | T2.5 | Interrupt a running turn | D | abort path, `onFinish` |
| 2 | T2.6 | Needs-user-input classifier after a reply | D | classifier `Output.object`, fire-and-forget |
| 2 | T2.7 | Ask AI from a saved chart with pinned context | V | prompt context |
| 3 | T3.1 | Verify an artifact: embedding job and artifact question job | D | `embed` telemetry spread, scheduler |
| 4 | T4.1 | Agent selector through the web router | V | `Output.object` |
| 5 | T5.1 | Data app clarify | V | `Output.object`, the clarify catch fix |
| 5 | T5.2 | Data app analysis: detect, prompt, lookup reuse | V | `Output.object`, `generateText` |
| 6 | T6.1 | Deep research run to a report | V | coordinator/worker tools, `reportFinalizer` |
| 6 | T6.2 | Cancel a deep research run | D | abort |
| 6 | T6.3 | Seeded finished research renders | D | none (render only) |
| 7 | T7.1 | Memory: distill, recall (pull count) | V, O | `Output.object`, memory block |
| 8 | T8.1 | Delivery summary on send-now | O | `generateText` |
| 8 | T8.2 | Autopilot heartbeat | O | `generateText` tool loop, narrative |
| 8 | T8.3 | Lightdash MCP server: `routeAgent` and `runMetricQuery` | V, default when `MCP_ENABLED=true` | selector |
| 8 | T8.4 | External MCP server on an agent (Lightdash pointed at itself) | V, default when `MCP_ENABLED=true` | `getStaticToolDescription`, description sanitisation, tool finish events |
| 8 | T8.5 | Evals run with judge scoring | O | `llmAsAJudge` `Output.object` |
| 8 | T8.6 | External connection config proposal | O | `Output.object` |
| 8 | T8.7 | Claude Code as a third-party MCP client (CLI subprocess, not Playwright) | O | MCP server interop |
| var | T2.2 again with `*_SUPPORTS_STREAMING=false` | non-streaming transport | O | `simulateStreamingMiddleware`, provider timing wrap |

## 5. Telling a real failure from model variance

Applied by every V test before it is reported red:

1. **Retry once.** Two consecutive failures of the same assertion are a
   failure. A pass on retry is logged as variance with the first attempt's
   ledger attached.
2. **Read the ledger before blaming the model.** In order:
   `ai_prompt.error_message` (any value is real);
   `ai_agent_tool_call_error` rows (the SDK rejected a tool call's schema:
   real, and the class the migration is most likely to break);
   `ai_agent_tool_result.metadata->>'status' = 'error'` with the result text
   (warehouse or tool error: real);
   backend log for `InvalidPromptError`, `NoObjectGeneratedError`,
   `NoOutputGeneratedError`, `APICallError` (the first three are real and
   migration-shaped; the last is provider or network, so environment).
3. **Classify.** Real when a deterministic invariant broke: a schema, a
   missing row, invalid SQL, a stream that ended in error, a timeout with no
   progress. Variance when only *which* tool, *how many* steps, or *which
   words* differ from the run before.

## 6. Tests

### Tier 0: preflight

#### T0.1 Preflight

- **Purpose.** Fail fast and legibly when the environment is not what the
  suite assumes, so later reds are never environment.
- **Preconditions.** Backend up, seed data present.
- **Steps.** `GET /api/v1/health` and read `ai.isAmbientAiEnabled`.
  `GET /api/v1/projects/{SEED_PROJECT}/explores` and check `orders`,
  `customers`, `payments`. Create F1 through `POST /api/v1/projects/{p}/aiAgents`
  and read it back. If `E2E_AI_BACKEND_LOG` is set, confirm the file exists
  and is growing.
- **Asserted.** Ambient AI enabled; three explores present; agent created with
  `enableDataAccess` and `enableSqlMode` true; log file readable when
  configured.
- **Not asserted.** Anything about providers or models.
- **Real vs variance.** Deterministic. Any failure is environment.

#### T0.2 Tooltip generation, the smallest model round trip

- **Purpose.** One structured-output call with no tools, no streaming and no
  warehouse. If this fails, the provider or the `Output.object` path is broken
  and nothing else should run.
- **Preconditions.** T0.1.
- **Steps.** `POST /api/v1/ai/{p}/tooltip/generate` with a field from
  `orders` and the prompt "show the value with two decimals". Record the
  wall time. Tooltips persist nothing, so the call is proven by the response
  alone. If the attribution witness is configured, find the `AI usage:` line
  with `feature=tooltip` written after the request started.
- **Asserted.** 200. Body matches `{ html: string }` with
  non-empty `html`. With the witness: one line with `feature=tooltip`,
  `functionId=generateTooltip`, `organizationId`, `projectId`, `provider`,
  `model`, `keyManagement` all present and `totalTokens > 0`.
- **Not asserted.** The HTML content. Which provider or model the line names.
- **Real vs variance.** Deterministic. A 4xx or 5xx or a body that is not
  `{html}` is real. A missing attribution field on the line is real; a
  missing witness file is a skip.

### Tier 1: ambient generators

All synchronous, all structured output, all converted in the migration.
Each one is a single model call, so they are the cheapest place to catch a
regression in structured output or in system-message handling.

#### T1.1 Chart metadata on Save hover

- **Purpose.** The generator that fires with no click. Prove the hover fires
  exactly one request and the save modal is prefilled.
- **Preconditions.** F1 not needed. Logged-in page.
- **Steps.** Open the explorer on `orders`, select one dimension and one
  metric, run the query. Register a `waitForRequest` on
  `POST /api/v1/ai/{p}/chart/generate-metadata`. Hover the Save button
  (`SaveChartButton/index.tsx`, `onMouseEnter`). Wait for the response. Click
  Save.
- **Asserted.** Exactly one metadata request during the hover. Response
  matches `{ title: string (1..140), description: string (1..500) }`. The
  save modal's name field is non-empty. Hovering again does not fire a second
  request for the same chart state (the hook dedupes per state key).
- **Not asserted.** The title or description text.
- **Real vs variance.** Deterministic. If the request never fires the trigger
  regressed; if it fires and the modal is blank, the hook swallowed an error:
  read the response status.

#### T1.2 Custom dimension generation, then the SQL runs

- **Purpose.** Generated SQL is only useful if the warehouse accepts it. Turn
  the model's freedom into a binary check by executing the result.
- **Preconditions.** Logged-in page on the explorer for `customers`.
- **Steps.** Open the custom SQL dimension modal. Click
  `aria-label="Generate custom dimension"` with the prompt "the customer's
  first name in upper case". Wait for `POST /api/v1/ai/{p}/custom-dimension/generate`.
  Save the dimension, add it to the query, run.
- **Asserted.** Response has non-empty `sql` and a `dimensionType` from the
  allowed enum. The SQL editor is populated. The query with the new dimension
  returns rows and no warehouse error.
- **Not asserted.** The SQL text, the function used.
- **Real vs variance.** V. Invalid SQL once may be variance; twice is real.
  A schema-invalid response is real on the first attempt.

#### T1.3 Table calculation, SQL and formula

- **Purpose.** Two generators sharing one modal; the formula one also fires
  on debounced typing.
- **Preconditions.** Explorer on `orders` with `orders` count metric run.
- **Steps.** API first: `POST /api/v1/ai/{p}/table-calculation/generate`
  ("running total of the order count") and
  `POST /api/v1/ai/{p}/formula-table-calculation/generate` (same prompt).
  Then in the browser open the table calculation modal, formula tab, type the
  prompt slowly and wait for the automatic preview request.
- **Asserted.** SQL variant matches `TableCalculationSchema` and, added to
  the query, runs without error. Formula variant matches
  `FormulaTableCalculationSchema` and the backend's own parser accepted it
  (a 200 proves it, the endpoint validates with `@lightdash/formula`). The
  typed preview fired at most one request per debounce window.
- **Not asserted.** The expression text.
- **Real vs variance.** V for the SQL executing; D for schema and for the
  debounce count.

#### T1.4 Thread title

- **Purpose.** The title is client-triggered right after thread creation and
  its message order was changed by the migration (user message last). Prove
  it lands in the DB and in the sidebar.
- **Preconditions.** F1.
- **Steps.** Create a thread through the browser with the first witness
  prompt. Wait for `POST .../threads/{t}/generate-title` to finish. Also call
  the endpoint directly on an API-created thread.
- **Asserted.** Response `{ title }` with 1..60 chars, not "Untitled thread".
  `ai_thread.title` equals it and `title_generated_at` is set. The sidebar
  shows `[data-tour-anchor="agent-thread"][data-tour-value="<title>"]`.
- **Not asserted.** Title wording.
- **Real vs variance.** Deterministic. A 4xx here after the migration most
  likely means the message-order fix regressed with a provider that rejects
  an assistant-final prompt; the log will show the provider error.

#### T1.5 Suggestion chips, empty state and post-response

- **Purpose.** Suggestions are computed on demand and silently fall back to a
  fixed chip set on any model error, so "chips exist" proves nothing. Prove
  the model actually produced them.
- **Preconditions.** F1 and F2 (two agents with different instructions).
- **Steps.** `GET /api/v1/projects/{p}/aiAgents/{a}/suggestions` for F1 and
  for F2 (empty state). After T2.1, call again with `threadUuid` and
  `afterMessageUuid`. In the browser, open F1's new-thread page and read
  `[data-tour-anchor="ai-suggestion"]` chips.
- **Asserted.** Each chip matches `{ kind: 'prompt' | 'navigate', … }` with
  non-empty text. The chip set is not equal to `SUGGESTION_FALLBACK_CHIPS`
  (copied into the test as the fallback fixture). The two agents' chip sets
  are not identical. Post-response chips include at least one `prompt` kind.
  Navigate chips, if any, point under `/projects/{p}/ai-agents/{a}/threads/`.
- **Not asserted.** Chip wording or count beyond "at least one".
- **Real vs variance.** D. Fallback set returned means the model call failed:
  read the log. Identical sets for two different agents twice in a row is
  real (the instruction is not reaching the prompt).

#### T1.6 Document summary on upload

- **Purpose.** Summary generation runs inside the upload request and falls
  back to a fixed summary on failure.
- **Preconditions.** F1, F7.
- **Steps.** `POST /api/v1/projects/{p}/aiAgents/{a}/documents` with F7. Read
  `ai_agent_document.summary`.
- **Asserted.** Upload 2xx. `summary` matches `DocumentSummarySchema`
  (`relevance` in `high|medium|low|none`, `description` 1..600). The summary
  is not the `createFallbackDocumentSummary` value (the implementer copies
  that marker into the test).
- **Not asserted.** Terms, related explores, the description text.
- **Real vs variance.** D. Fallback stored means the model call failed.

#### T1.7 Chart similarity for review requests

- **Purpose.** The one generator that uses `system` plus `prompt` rather than
  `messages`, and that runs with `maxRetries: 0` and its own abort signal.
- **Preconditions.** Seeded charts exist in the project (they do).
- **Steps.** `POST /api/v1/projects/{p}/review-requests/similar` with the
  name and query of a seeded chart, as the review modal would send.
- **Asserted.** 200. Body is an array of at most 12 matches, each
  with `uuid`, `relationship` in `potential_duplicate|related`, `explanation`
  1..1000. No `unrelated` entries (dropped server-side).
- **Not asserted.** Which charts match, or that any do. An empty array is a
  pass.
- **Real vs variance.** D on shape. The endpoint aborts its own model call
  (a constant in `chartSimilarity.ts`); hitting that abort twice is real.

### Tier 2: the AI agent answering questions

Question answering through the visualization generator and the SQL runner is
the coverage bar for tools; there is no per-tool test.

#### T2.1 Non-streaming answer with a warehouse query (API)

- **Purpose.** The full agent loop without a browser: tools, `AgentContext`,
  warehouse, persistence, telemetry. This is the reference ledger the browser
  tests compare against.
- **Preconditions.** F1. Attribution witness optional.
- **Steps.** `POST /api/v1/projects/{p}/aiAgents/{a}/threads` with
  "How many orders are there in total?". `POST .../threads/{t}/generate`.
  Then read `GET .../threads/{t}` and the DB. With the witness, read the log.
- **Asserted (Postgres, always).** `ai_prompt.response` non-empty,
  `responded_at` set, `error_message` null, `response_timing` non-null.
  `ai_prompt.token_usage` is an object with `totalTokens > 0` and
  `finalStepTotalTokens > 0`, `finalStepTotalTokens <= totalTokens`. At least
  one `ai_agent_tool_result` for `generateVisualization`, `runQuery` or
  `runSql` with `metadata->>'status' = 'success'` and a `queryUuid`; that
  `query_history` row has `context = 'ai'`, `status` success,
  `total_row_count > 0`. No `ai_agent_tool_call_error` rows.
- **Asserted (log, attribution only, when the witness is set).** One or more
  `AI usage:` lines with `feature=agent`, this `threadId` and `promptId`,
  and `organizationId`, `projectId`, `aiAgentId`, `provider`, `model`,
  `keyManagement` all present. The sum of their `totalTokens` is consistent
  with `ai_prompt.token_usage.totalTokens`.
- **Not asserted.** The number in the answer, the tool chosen among the three,
  the step count, the provider or model named.
- **Real vs variance.** V. A reply with no query tool result once is variance
  (the model answered from metadata); twice is real. Any tool error row,
  schema error row, null `token_usage`, or a missing attribution field on a
  present line is real on the first attempt.

#### T2.2 Streaming answer in the browser

- **Purpose.** The SSE path end to end: composer, stream, working indicator,
  final bubble, terminal row. The `onChunk` switch and chunk-type timing
  live here.
- **Preconditions.** F1. Page at `/projects/{p}/ai-agents/{a}/threads`.
- **Steps.** Type the first witness prompt into the composer
  (`.ProseMirror[contenteditable="true"]`, placeholder starts with "Ask").
  Register `waitForResponse` on `POST .../threads/{t}/stream`. Click
  `role=button name="Send message"`. Wait for `[data-tour-anchor="ai-working"]`
  to appear, then for the stream response to finish, then for the anchor to
  disappear and the send button to return. Capture the stream body text.
- **Asserted.** Stream status 200, finished without the page showing an error
  toast. Assistant bubble text non-empty. The captured body contains
  `text-delta` parts and at least one tool part (`tool-input-start` or
  `tool-call`). DB row as in T2.1. `response_timing` records a first-chunk
  time smaller than the total (the implementer reads the field names from
  `turnTiming.ts`).
- **Not asserted.** Chunk contents, chunk count, answer wording.
- **Real vs variance.** V on tool use, D on stream completion. A stream that
  ends with an `error` part, or a bubble that never resolves, is real.

#### T2.3 Visualization artifact

- **Purpose.** `generateVisualization` writes an artifact through the shared
  `AgentContext`; the browser renders it; the artifact is queryable.
- **Preconditions.** F1.
- **Steps.** Send "Show a bar chart of the number of orders by status" in the
  browser. Wait as in T2.2. Then read `ai_artifacts` and
  `ai_artifact_versions` for the thread, and call
  `GET .../artifacts/{artifactUuid}/versions/{versionUuid}/viz-query`.
- **Asserted.** `[data-testid="ai-visualization"]` visible. One
  `ai_artifacts` row with `artifact_type = 'chart'` and a version with
  non-null `chart_config` linked to this prompt. The viz-query endpoint
  returns rows. Tool result for `generateVisualization` has status success.
- **Not asserted.** Chart type (bar vs column), field labels, title text.
- **Real vs variance.** V. No artifact once may be the model answering with a
  table; twice is real. Artifact row without a rendered element is real.

#### T2.4 Raw SQL with the approval card, and auto-approve

- **Purpose.** `runSql` is the second answering path and the only one with a
  human gate. Cover the card, the DB approval row and the auto-approve flag.
- **Preconditions.** F2 (SQL-first agent). SQL runner permission on the
  admin user (seeded).
- **Steps.** Browser: send "Using SQL, count the rows in the orders table".
  Wait for the approval card (text "Approve" inside the tool call card).
  Click Approve. Wait for the stream to finish. API: new thread on F2,
  `POST .../stream` with `{ autoApproveSql: true }`, consume to the end.
- **Asserted.** Card shown; after approval an `ai_sql_approval` row exists
  for the tool call; `runSql` tool result status success with a `queryUuid`
  whose `query_history` row has `compiled_sql` and `context = 'ai'`. In the
  auto-approve run no card and `ai_thread.sql_auto_approved_at` set.
- **Not asserted.** The SQL text, the count.
- **Real vs variance.** V on the model choosing `runSql` despite the
  instruction. Check `GET .../threads/{t}` to confirm `runSql` was in the
  tool set (a missing tool is real: the gate regressed). Twice choosing
  another tool with the tool present is variance, and the instruction should
  be strengthened rather than the test relaxed.

#### T2.5 Interrupt a running turn

- **Purpose.** The abort path through the stream and the persisted interrupt.
- **Preconditions.** F1.
- **Steps.** Send "Which customer placed the most orders, and list their
  orders one by one with dates?" (long enough to interrupt). As soon as
  `[data-tour-anchor="ai-working"]` shows, click the interrupt button that
  replaces Send. Wait for the stream response to finish.
- **Asserted.** `ai_prompt_interrupt` row for the prompt. Stream finished
  (not hung). UI back to idle with the send button. `ai_prompt.responded_at`
  set after the click; `error_message` null or an interrupt marker, never a
  provider error.
- **Not asserted.** Whether any partial text was kept.
- **Real vs variance.** D. If the turn finishes before the click, retry with
  a longer prompt; otherwise any hang or error is real.

#### T2.6 Needs-user-input classifier after a reply

- **Purpose.** An in-process fire-and-forget classifier with a deterministic
  regex pre-gate. Prove it runs and lands one-shot in the prompt row.
- **Preconditions.** `AI_AGENT_PROMPT_INPUT_REQUEST_CLASSIFIER_ENABLED=true`.
  F3 (agent instructed to end with a question).
- **Steps.** API thread on F3 with "Tell me about orders". `generate`. Poll
  `ai_prompt.needs_user_input` until it is non-null, giving up only once the
  classifier's own abort window (a constant in
  `promptInputRequestClassifier.ts`) has passed since `responded_at`.
- **Asserted.** The reply ends with `?` (if not, the pre-gate cannot fire;
  retry once, then skip with reason). `needs_user_input` becomes non-null and
  `needs_user_input_metadata` is an object with a numeric or null
  `confidence`. A second `generate` on the same prompt does not overwrite the
  value.
- **Not asserted.** Whether the boolean is true. It is reported.
- **Real vs variance.** V only on the reply ending with `?`. Gate fired and
  column still null once the classifier's abort window has passed is real.

#### T2.7 Ask AI from a saved chart with pinned context

- **Purpose.** The Ask AI entry point, the Launcher, and pinned context
  persisted on the prompt.
- **Preconditions.** F1. A seeded saved chart.
- **Steps.** Open the chart page. Use the Ask AI menu item; the Launcher dock
  opens (`aria-label="Ask AI Agent"`). Confirm the chart chip is pinned. Send
  "Describe what this chart shows". Wait as in T2.2.
- **Asserted.** `ai_prompt_context` has a row linking the prompt to the
  chart. Reply non-empty. At least one tool call that reads the chart
  (`readContent`, `runSavedChart` or `runContentQuery`) with status success.
- **Not asserted.** The description text.
- **Real vs variance.** V on which read tool; missing context row is real.

### Tier 3: after-the-answer jobs

#### T3.1 Verify an artifact: embedding job and artifact question job

- **Purpose.** Two Graphile jobs enqueued fire-and-forget on verification,
  one of them the `embed` call whose telemetry spread changed in the
  migration.
- **Preconditions.** The T2.3 artifact. `AI_EMBEDDING_ENABLED=true` and an
  embedding-capable provider for the embedding half; otherwise that half is
  skipped with reason.
- **Steps.** `PATCH .../versions/{v}/verified` with `{ verified: true }`.
  Poll `scheduler_log` for tasks `embedArtifactVersion` and
  `generateArtifactQuestion` with this version until both are terminal. Then
  read the version row and `GET .../{agentUuid}/verified-questions`.
- **Asserted.** Both jobs reach `completed`. `verified_question` is a
  non-empty string of at most 200 chars and appears in the endpoint.
  `embedding_vector` non-null with `embedding_model` and
  `embedding_model_provider` set (when enabled); those two columns are the
  Postgres proof that the embedding call happened. With the attribution
  witness: an `AI usage:` line with `feature=embedding` carrying
  `organizationId` and `projectId`.
- **Not asserted.** The question text, the vector.
- **Real vs variance.** D. Job `error` status is real; read `scheduler_log.details`.

### Tier 4: routing

#### T4.1 Agent selector through the web router

- **Purpose.** The selector is reachable without Slack through
  `POST /api/v1/org/aiRouter/route` and persists its decision.
- **Preconditions.** F4 pair. `PUT /api/v1/org/aiRouter` with
  `{ enabled: true, projectUuids: [SEED_PROJECT] }`.
- **Steps.** Route "What is total revenue by payment method?". Route "Which
  customers signed up this year?". Read `ai_router_decision`. In the browser
  open the home search box, pick the "Auto" option
  (`[data-tour-anchor="agent-selector"]`), send the first prompt, and follow
  the flow to a thread.
- **Asserted.** Each response has `nextAction` in `create_thread|show_picker`
  and a decision with `confidence` in `high|medium|low`. Each decision row
  has both fixture agents in `candidate_agent_uuids` and a
  `suggested_agent_uuid` from that set. The browser flow ends on a thread
  page whose `ai_thread.agent_uuid` matches the committed decision
  (`committed_at` set).
- **Not asserted.** Which agent was chosen. The revenue prompt landing on the
  revenue agent is reported, not asserted.
- **Real vs variance.** V on the pick. A decision row missing, or a suggested
  agent outside the candidates, is real.

### Tier 5: data apps

#### T5.1 Data app clarify

- **Purpose.** A single structured call with its own abort and a documented
  fallback to no questions. The clarify catch was patched in the migration
  review; this is its regression check.
- **Preconditions.** Data apps enabled for the project (flags on).
- **Steps.** `POST /api/v1/ee/projects/{p}/apps/clarify` twice: once with
  "make me an app" and once with a fully specified prompt naming charts and
  layout. Read the log for `App clarify:` lines.
- **Asserted.** Both 200, body `{ questions: string[] }` with at
  most 4 non-empty strings. Clarify persists nothing, so the only proof the
  model was consulted rather than the empty fallback taken is the backend
  log: `App clarify: N question(s)` for both calls and never
  `App clarify failed`. With the attribution witness, an `AI usage:` line
  with `feature=data-app`, `functionId=clarifyApp`, `organizationId`,
  `projectId` and `userId`.
- **Not asserted.** The number of questions, or that the vague prompt gets
  more (it usually does; reported).
- **Real vs variance.** D. A `failed` log line is real and its message names
  the error class.

#### T5.2 Data app analysis: detect, prompt, lookup reuse

- **Purpose.** The runtime analysis surface with server-side grounding and
  content-hash reuse, both deterministic.
- **Preconditions.** F5 playground project with the "Jaffle pulse" app ready
  (needs app-runtime S3). `PATCH /api/v1/aiAgents/admin/settings` with
  `{ dataAppRuntimeAiEnabled: true }`.
- **Steps.** In the browser open the app view and the analysis panel
  (`[data-testid="data-app-analysis-panel"]`), run detect. API:
  `POST /api/v2/projects/{p}/apps/{app}/analysis/detect` with the same
  sources, then `.../analysis/lookup` with the same sources, then
  `.../analysis/prompt` with "What stands out?".
- **Asserted.** Detect result matches `DataAppDetectionSchema`; every anomaly
  present has `dimensionValues` (grounded); if any were dropped, a limitation
  string of the form `N finding(s) could not be matched…` is present. One
  `data_app_analyses` row per operation with `model_id` set. Lookup returns
  the existing analysis and creates no new row. Prompt result has non-empty
  `text`.
- **Not asserted.** Anomaly count or wording.
- **Real vs variance.** V on anomaly presence; D on grounding, reuse and rows.

#### T5.3 Data app generation from Ask AI (opt-in)

- **Purpose.** The coding agent path: `generateDataApp` tool, build card,
  version reaching ready.
- **Preconditions.** `SANDBOX_PROVIDER=docker`, app-runtime S3/MinIO, F1.
- **Steps.** Send "Build a small data app that shows orders by status" in
  the browser. Watch the build card. Poll `app_versions.status` for the app
  linked to this thread until terminal; while non-terminal,
  `status_updated_at` must keep advancing, and a build whose it stops
  advancing is failed as hung.
- **Asserted.** A `generateDataApp` tool call with success; an `apps` row
  with creation experience `ai_agent`; `app_versions.status` reaches `ready`
  with `status_history` progressing through the stage order; the preview
  panel loads the app.
- **Not asserted.** App content.
- **Real vs variance.** `error` with a sandbox or build message is real;
  a coding-agent loop that runs out of steps once is variance.

### Tier 6: deep research

#### T6.1 Deep research run to a report

- **Purpose.** Coordinator, workers, evidence pack and finalizer, run at
  whatever deep research limits the org has configured. The test does not
  read, lower or restore those limits and takes as long as the run takes.
- **Preconditions.** F1.
- **Steps.** Browser: switch the composer to deep research and click
  `role=button name="Start research"` with "Why do some order statuses have
  more orders than others?". Read the 202 from
  `POST /api/v1/ee/projects/{p}/ai-deep-research`. Poll
  `GET .../ai-deep-research/{run}` until terminal; while the run is
  non-terminal, `updated_at` and the events count must keep advancing, and
  a run whose they stop advancing is failed as hung. When terminal, open the
  report card (`[data-tour-anchor="research-report-open"]`).
- **Asserted.** `status` ends in `completed` or `partially_completed`;
  `partially_completed` is accepted only with a budget `terminal_reason`.
  `result_markdown` non-empty, `warehouse_query_count >= 1`,
  `query_history` rows with `context = 'ai'` created during the run.
  Token breakdown on the run row: `input_tokens > 0`, `output_tokens > 0`,
  `total_tokens >= input_tokens + output_tokens`, `cache_read_tokens`,
  `cache_write_tokens` and `reasoning_tokens` non-null integers, and
  `token_usage_complete = true` for a `completed` run. `duration_ms` is a
  positive integer. The report renders in the browser.
- **Not asserted.** Findings, chart count, report content, how long the run
  took.
- **Real vs variance.** `failed` is real and `failure_stage` says where
  (`finalization` points at `reportFinalizer`). A non-terminal run whose
  progress signals stop advancing is real (hung), however long it has been
  running. `partially_completed` on budget is variance-adjacent and
  reported.

#### T6.2 Cancel a deep research run

- **Purpose.** The cancel path and the 409 guard for a second concurrent run.
- **Preconditions.** As T6.1.
- **Steps.** Start a run through the API; immediately start another on the
  same thread (expect 409); after `status = running`, `POST .../cancel`.
  Poll to terminal.
- **Asserted.** Second create returns 409. Status reaches `cancelled` with
  `cancellation_requested_at` set.
- **Not asserted.** Anything produced before cancellation.
- **Real vs variance.** D.

#### T6.3 Seeded finished research renders

- **Purpose.** The report UI on a known run without spending a model call.
- **Preconditions.** F5.
- **Steps.** Open the playground thread "Why returns rose in the spring" and
  the report card.
- **Asserted.** Report card present, report opens with markdown content.
- **Real vs variance.** D.

### Tier 7: memory (opt-in, deprecated feature)

Memory is switched off for every organization and its toggle is gone
(`docs/ai-agent-memory/CONTEXT.md`). Consolidation has no endpoint and needs
30 active memories, so it is out. Distill and recall stay in as one opt-in
test because the code is live and the migration touched both its calls.

#### T7.1 Memory: distill, then recall

- **Purpose.** One thread distils into at most one memory; a later thread
  pulls it.
- **Preconditions.** `UPDATE organizations SET ai_agent_memory_enabled = true`
  for the seed org (direct SQL, by design). F1 with `enableSelfImprovement: true`.
- **Steps.** Thread A on F1: "For all my questions, treat the payments
  explore as the source of truth for revenue and call payment_method
  'channel'. Now, how many orders are there?" and `generate`. Force
  distillation: `POST /api/v1/projects/{p}/aiAgentMemories/threads/{A}/distill`
  (202). Poll `ai_agent_thread_distill.outcome` for thread A until an
  outcome is recorded.
  If `memory`, start thread B on F1 with "What is revenue by channel?" and
  `generate`. Re-read the memory row.
- **Asserted.** Outcome in `memory|no_op|skipped|failed`; `failed` is real.
  On `memory`: an `ai_agent_memory` row with `status = 'active'`, non-empty
  `terms` and `objects`, `source_thread_uuid = A`. After thread B:
  `pulled_count >= 1` and `last_pulled_at` set. The memories modal on the
  agent page lists it.
- **Not asserted.** Memory wording; citation in the reply (reported).
- **Real vs variance.** `no_op` once is variance (distill is conservative);
  twice with that explicit preference is reported as a coverage gap, not a
  failure. `pulled_count` staying 0 after B with an active memory is real.

### Tier 8: opt-in integrations

Each needs something beyond a backend and a provider. T8.3 and T8.4 need
only `MCP_ENABLED=true` and are part of the default run whenever it is set;
T8.4 in particular exercises the untrusted external MCP description path
(`getStaticToolDescription` plus the sanitisation wrapper) that the
migration changed and nothing else in this plan reaches. The rest are here
so the reviewer sees them, and so an operator who has the setup can run them.

#### T8.1 Delivery summary on send-now

- **Preconditions.** A scheduled delivery on a seeded dashboard with an email
  or Slack destination the operator can read. `POST /api/v1/schedulers/{s}/ai-augmentation`
  with instructions and no agent (fast-model mode).
- **Steps.** `POST /api/v1/schedulers/{s}/send`. Poll `scheduler_log` for
  the delivery job.
- **Asserted.** Job completed; `details` carries no `AI_AUGMENTATION` partial
  failure. The summary text is not persisted, so with the attribution
  witness the `AI usage:` line with `feature=delivery-summary` is the proof
  the model ran; without it, only the absence of the partial failure is
  asserted. Message text only when the destination is a capture inbox.
- **Real vs variance.** D on the partial-failure flag.

#### T8.2 Autopilot heartbeat

- **Preconditions.** `PATCH /api/v1/projects/{p}/managed-agent/settings`
  `{ enabled: true }`, no Slack channel.
- **Steps.** `POST /api/v1/projects/{p}/managed-agent/run`. Poll
  `GET .../runs/latest` with a watchdog.
- **Asserted.** Run reaches a terminal status; `managed_agent_runs` row has a
  non-empty narrative; every `managed_agent_actions` row has a `target` and
  is reversible through `POST .../actions/{id}/reverse` (reverse one). With
  the attribution witness: `AI usage:` lines with `feature=managed-agent`
  and this `managedAgentRunId`.
- **Not asserted.** What it decided to do.
- **Real vs variance.** An error status is real; an empty action list is
  variance and expected on a clean seed.

#### T8.3 Lightdash MCP server: `routeAgent` and `runMetricQuery`

- **Preconditions.** `MCP_ENABLED=true`. F4 pair (so `routeAgent` has a
  choice).
- **Steps.** JSON-RPC over `POST /api/v1/mcp/projects/{p}` with
  `Authorization: Bearer <SEED_PAT>`: `initialize`, `tools/list`,
  `tools/call routeAgent` with the revenue prompt, `tools/call runMetricQuery`
  on `orders`.
- **Asserted.** Tool list contains the 35 registered names. `routeAgent`
  returns an agent from the pair. `runMetricQuery` returns rows and a
  `query_history` row with `context = 'mcp.run_metric_query'`. Two
  `mcp_tool_call` rows with `status = 'success'`, `auth_type` set.
- **Real vs variance.** V only on the routed agent.

#### T8.4 External MCP server on an agent, Lightdash pointed at itself

- **Purpose.** Lightdash as an MCP *client*. The migration rewrote
  `hardenMcpToolDefinition` around `getStaticToolDescription` and the
  untrusted-description prefix, and changed how outbound tool calls are
  recorded; no unit test drives that path against a live server. Pointing
  the agent at Lightdash's own MCP endpoint needs no third party. Default
  when `MCP_ENABLED=true`.
- **Preconditions.** `MCP_ENABLED=true`. `POST /api/v1/projects/{p}/aiAgents/mcpServers`
  with the local MCP URL and a PAT credential; attach to F1 and allow
  `listExplores` only.
- **Steps.** Send "Use the connected MCP server to list the explores in this
  project" in the browser.
- **Asserted.** `ai_agent_tool_call` row with `ai_mcp_server_uuid` set;
  `mcp_tool_call` row with `mcp_session_id = threadUuid`, `status`, and a
  `duration_ms` integer; the tool description in `GET .../threads/{t}`
  starts with the untrusted-description prefix.
- **Real vs variance.** V on the model calling the
  MCP tool; missing hardening prefix or duration is real.

#### T8.5 Evals run with judge scoring

- **Preconditions.** F1.
- **Steps.** `POST .../{a}/evaluations` with two prompts, one with an
  expected answer. `POST .../evaluations/{e}/run`. Poll the run.
- **Asserted.** Run completes; one result per prompt; each result has a
  factuality assessment when an expected answer exists and a context
  relevancy assessment; assessment scores are within their schema bounds.
- **Not asserted.** Pass or fail verdicts.
- **Real vs variance.** A result stuck without assessments while the run is
  no longer progressing is real.

#### T8.6 External connection config proposal

- **Steps.** `POST /api/v1/ee/projects/{p}/external-connections/propose-config`
  describing a public REST API.
- **Asserted.** Either a body matching `ProposalSchema`, or the documented
  `MissingConfigError` ("AI is not configured for this organization"), in
  which case the test skips with that reason. Any other error is real.
- #### T8.7 Claude Code as a third-party MCP client (CLI subprocess, not Playwright)

- **What this is.** An interop test of Lightdash's MCP *server* against a
  real, independent MCP client implementation, rather than Lightdash talking
  to itself as in T8.4. It runs Claude Code as a subprocess from the test
  runner. It is not a Playwright test and does not use the browser harness;
  whoever implements it should place it beside the Playwright specs as a
  plain script and document that it needs the Claude Code CLI on the path.
  The model doing the reasoning here is Claude Code's own, not the Lightdash
  provider; nothing about it is asserted.
- **Purpose.** Tool discovery by a foreign client, acceptance of Lightdash's
  tool input schemas by that client, one tool call round trip, and the
  untrusted-output notice Lightdash puts on tool output surviving into the
  client transcript verbatim.
- **Preconditions.** `MCP_ENABLED=true`. Claude Code installed and signed in
  on the operator machine. The seed PAT.
- **Steps.**
  1. `GET $SITE_URL/.well-known/oauth-authorization-server/api/v1/mcp` and an
     unauthenticated `POST $SITE_URL/api/v1/mcp` to record the discovery
     surface a client sees.
  2. `claude mcp add --transport http lightdash $SITE_URL/api/v1/mcp --header "Authorization: ApiKey ldpat_deadbeefdeadbeefdeadbeefdeadbeef"`
     (the operator's example uses `http://localhost:8080`; use `SITE_URL`).
  3. `claude mcp get lightdash` to confirm the client connected and listed
     tools.
  4. `claude -p "Using only the lightdash MCP tools, list the explores in the Jaffle shop project and then read the metadata of the orders explore. Reply with the tool names you called." --output-format json`
     with the allowed tools restricted to the `mcp__lightdash__*` set so the
     client cannot answer from elsewhere.
  5. Read `mcp_tool_call` for rows created during the run. Remove the server
     with `claude mcp remove lightdash`.
- **Asserted.** Step 1: the well-known document is JSON with an
  `authorization_endpoint`, and the unauthenticated POST answers 401 with a
  `WWW-Authenticate: Bearer resource_metadata=…` header. Step 3: the server
  is reported connected with a non-empty tool list that contains
  `listExplores` and `getMetadata`. Step 4: exit code 0 and a JSON result;
  the transcript names at least `listExplores` and `getMetadata`. Step 5:
  `mcp_tool_call` rows for those tools with `status = 'success'`,
  `auth_type` for a PAT, `client_name` and `protocol_version` non-empty, and
  `tool_args` that the server accepted without a validation error. Any
  untrusted-content notice Lightdash prefixes to that tool's output (the
  implementer reads the constant from `McpService.ts`) appears verbatim in
  the transcript, proving the client did not strip or rewrite it.
- **Not asserted.** Which words Claude Code used, how many turns it took,
  the Claude Code model, any Lightdash provider.
- **Real vs variance.** A connection or discovery failure, a tool call the
  server rejected on schema, or a missing notice is real. The client calling
  an extra tool, or calling the two in a different order, is variance.

## 7. Deliberately left out

| Feature | Why |
|---|---|
| Project router (`routeProjectForSlack`) | Slack-only, reached only when an org has no agents and the Slack system-agent fallback is on. Needs a Slack app install, signing secret and channel mapping to post a signed event. Its decision logic is unit tested; nothing here would add signal for the cost. |
| Memory consolidation | No endpoint, needs 30 active rows in one partition, daily cron. Feature is deprecated. |
| Thread compaction | Fires only when the previous prompt's context occupancy exceeds the model window minus 16k tokens; reaching that legitimately means a very long thread against whatever model is configured, and the test must not choose a small model. Observable only in `ai_thread_compaction` and a debug log. |
| AI writeback, agent onboarding, review remediation | Need a GitHub App install and a coding-agent sandbox. |
| Review classifier | Needs the org reviews setting plus a BYO judge model, and the job is deliberately delayed. Listed here rather than as opt-in because the delay makes a manual run impractical. |
| Live activities | Apple push, mobile only. |
| Embedded agent | Same agent behind an embed JWT; `packages/api-tests/tests/embedAiAgent.test.ts` already covers the access path headlessly. |
| Chart Studio | A data app viz built by the coding agent; covered only through T5.3 when the sandbox is available. |
| Slack delivery of anything | No Slack in the default run; T8.1 and T8.2 accept a Slack destination but do not require one. |
| Dashboard summaries | Out of scope by rule; the `dashboard_summaries` table has no live code. |

## 8. Decisions taken in review, and one still open

Taken:

1. **Selectors.** Role, label and text selection plus the existing
   `data-testid` and `data-tour-anchor` attributes. No new test ids are
   assumed and no product change is a precondition. This is the main flake
   source and is accepted.
2. **Telemetry.** Token consumption is asserted from Postgres
   (`ai_prompt.token_usage`, the `ai_deep_research_runs` breakdown) and is
   real coverage by default. Only the attribution dimensions (feature,
   provider, model, keyManagement, org, project, agent), which the migration
   reworked and which Postgres does not carry, read the `AI usage:` log line
   through `E2E_AI_BACKEND_LOG`, and are skipped and reported when it is
   unset.
3. **MCP in the default run.** T8.3 and T8.4 run by default whenever
   `MCP_ENABLED=true`.
4. **Third-party client.** T8.7 covers interop with Claude Code as a real
   MCP client; it is a CLI subprocess test outside the Playwright harness.
5. **No bounds, no pre-measurements.** The plan carries no runtime estimates
   and no time-based assertions, so nothing here is a contract to write a
   timeout against. T6.1 runs at the org's configured deep research limits
   and touches no setting. Long-running tests detect a hung run through a
   progress watchdog expressed as "progress must keep advancing", never as a
   number of minutes.

There are no open decisions.
