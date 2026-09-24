# @lightdash/e2e-ai

Manual Playwright coverage for Lightdash's AI features.

`AI_TEST_PLAN.md` is the written suite: what to test, in what order, with what
setup and assertions. The specs in `tests/` implement it, one file per plan
test id (`t<tier>.<n>-<name>.spec.ts`). T3.2 is the one spec the plan does not
list: the read half of T3.1's embeddings, added on request.

Ground rules this plan is written against:

- **Playwright**, not Cypress or Puppeteer. The backend already depends on
  `playwright@1.56.1` and Chromium is cached locally, so no new install.
- **Run by hand.** No CI wiring, no scheduling.
- **The operator owns the backend and the providers.** Tests must never switch,
  select or assert a specific model provider; whichever is configured is the one
  under test.
- **Feature flags are on.** Assume the full AI surface is enabled.
- **Dashboard summaries are out of scope** — legacy, possibly being removed.

## Running

From the repo root, one test:

```bash
pnpm -F @lightdash/e2e-ai test tests/t0.1-preflight.spec.ts
```

The whole suite, in plan order: `pnpm -F @lightdash/e2e-ai test`. A failure in
tier 0 or 1 skips every later tier in that run. `pnpm -F @lightdash/e2e-ai
report` opens the HTML report, which carries the annotations (skipped checks,
observations) and the ledgers attached to V tests.

Nothing to install: `playwright`, `pg`, `zod` and `@lightdash/common` resolve
from `packages/backend/node_modules` through `tsconfig.json` paths, which
Playwright also applies at runtime.

Checks: `pnpm -F @lightdash/e2e-ai typecheck`, `lint` (oxlint) and `format`
(oxfmt; `fix-format` rewrites).

## Restarting the backend

Some tests need backend env (plan §2), which means a restart. Stop the
backend, then wait until nothing listens on the API and metrics ports before
starting it again:

```bash
while lsof -t -i tcp:8080 -i tcp:9090 -s TCP:LISTEN >/dev/null; do sleep 1; done
```

A backend started while the old process still holds `:9090` dies with
`EADDRINUSE`, and `tsx watch` does not restart after a crash, so the app then
answers `ECONNREFUSED`. Check `GET /api/v1/health` before a live run.

## What has to be turned on

App-runtime S3 is not the blocker the plan assumes for tier 5: `APPS_S3_*`
fall back to the base `S3_*` settings, so a dev backend with MinIO already
has it. What has to be turned on instead:

| Test | Needs |
|---|---|
| T2.6 | `AI_AGENT_PROMPT_INPUT_REQUEST_CLASSIFIER_ENABLED=true` on the backend **and exported in the runner's shell too**: no endpoint reports the setting, so the test reads the runner's copy and skips without it. |
| T3.1 | `AI_EMBEDDING_ENABLED=true` for the embedding half. |
| T3.2 | `AI_EMBEDDING_ENABLED=true` and an embedding provider (`openai`, `bedrock` or `azure` as `AI_DEFAULT_EMBEDDING_PROVIDER`, else `AI_DEFAULT_PROVIDER`). Without an embedding there is nothing to retrieve, so it skips. |
| T5.1 | Data apps: `APPS_RUNTIME_ENABLED=true`. |
| T5.2 | Data apps, the `enable-data-app-analysis` and `new-onboarding` feature flags, and F5, which only exists in an organization that had no project (see Findings). It skips in the seed org whatever is turned on. |
| T5.3 | Data apps, `E2E_AI_OPT_IN=1`, `SANDBOX_PROVIDER=docker`, and the `lightdash-sandbox:local` image, built by `sandboxes/data-apps/build-local-image.sh` (about 2.3 GB). |
| T6.3 | `new-onboarding` and F5, so it skips in the seed org like T5.2. |
| T7.1 | `E2E_AI_OPT_IN=1`. The test turns memory on for the seed org by SQL and restores it. |
| T8.1 | `E2E_AI_OPT_IN=1` and an email client; set `E2E_AI_MAILPIT_URL` when mail goes to Mailpit. |
| T8.2 | `E2E_AI_OPT_IN=1` and the `ai-autopilot` feature flag. Without the flag, enabling autopilot still succeeds but every heartbeat skips silently. |
| T8.4 | `MCP_ENABLED=true` and, for a backend on localhost, `AI_AGENT_MCP_ALLOW_PRIVATE_ADDRESSES=true`: the agent reaches Lightdash's own MCP endpoint through `E2E_AI_SITE_URL`, and the backend refuses private MCP server URLs without it. |
| T8.7 | `MCP_ENABLED=true` and the `claude` CLI on the path, signed in. A plain script, not a spec: `pnpm -F @lightdash/e2e-ai t8.7`. It hands Claude Code the server through a temporary `--mcp-config`, so your Claude Code configuration is never touched. |
| var | T2.2 again (`tests/t2.2-streaming-answer.spec.ts`, unchanged) against a backend restarted with the provider's `*_SUPPORTS_STREAMING=false`, e.g. `OPENAI_SUPPORTS_STREAMING=false`. |

Each test checks these read-only before it creates anything, and skips with
the reason.

## Known red and known gaps

Red means a product function does not work. A gap means the function works
but cannot be observed; the test passes and prints a `[WARNING]` line.

Known red:

- **T7.1 fails on an OpenAI provider without the union fix.** The memory
  distill schema used `z.discriminatedUnion`, at the top level and inside the
  shared `aiProjectContextTypedObjectRefSchema`. That serialises to JSON
  Schema `oneOf`, which OpenAI strict structured outputs reject ("'oneOf' is
  not permitted"), so every distill recorded outcome `failed`, on `main` too.
  Both are now `z.union` on this branch; a sweep of every `Output.object`
  schema found one more `oneOf`, in `agentSuggestionsModelSchema`, which
  fails only where the suggestion model resolves to OpenAI. The shared ref
  also reached the review classifier's project-context call
  (`authorProjectContextEntry.ts`), so that call failed on OpenAI too. The
  backend unit test `structuredOutputSchemasPassOpenAiStrictMode.test.ts`
  (stacked on the fix PR) now fails CI on any `oneOf`, `allOf` or `not` in a
  structured-output schema.

Known gaps:

- **T8.1: delivery summaries have no cost attribution.** The summary is
  generated and delivered, and the test proves that from the email when
  `E2E_AI_MAILPIT_URL` is set. But `AiService.generateDeliverySummary` never
  calls `emitAiUsage` (the same is true on `main`), so no `ai.usage` line is
  written, and the test reports that as a warning. As soon as the product
  logs the line, the check becomes an assertion on its attribution.

## Findings

Things the suite found that an operator or a developer building on these
features needs to know.

- **Autopilot aggression "flag" still creates content and rewrites charts.**
  Aggression only removes the cleanup (delete) tools. Creating content and
  fixing broken charts are separate capabilities (`createContent`,
  `modifyExistingContent`), on by default. In "flag" mode a run created 3
  charts and rewrote the seed's deliberately broken "Order amounts by
  month". T8.2 now turns both capabilities off for its run.
- **Autopilot can be enabled without the `ai-autopilot` flag.** The settings
  PATCH returns 200 and schedules a daily heartbeat, but every heartbeat
  skips at info level, so autopilot reads as on while nothing ever runs.
- **A project-pinned MCP endpoint still requires `projectUuid`.** Tools such
  as `list_explores` on `/api/v1/mcp/projects/{p}` take a required
  `projectUuid` that must match the pin. An agent that cannot call a context
  tool has no way to learn it, so the model sends nil UUIDs and the call
  fails with "The requested project does not match the pinned MCP project".
  T8.4 also allows `get_current_project` for that reason.
- **An optional MCP uuid field advertises sentinel values the server then
  rejects.** On the Lightdash MCP server, `list_explores` (and other
  project-scoped tools) take an optional `agentUuid`. Its schema comes from
  zod 4 `uuid()`, whose pattern explicitly accepts the nil UUID
  (`00000000-0000-0000-0000-000000000000`) and the max UUID
  (`ffffffff-ffff-ffff-ffff-ffffffffffff`). A model can reasonably read
  those as "no agent" sentinels, and one does: the Lightdash agent calling
  the server over MCP sent both, and the server treated them as real agent
  ids and failed with "AI agent not found for uuid: …". Claude Code omits
  the field and succeeds (T8.7). The fix belongs on the server: treat nil
  and max as absent on an optional uuid, or stop advertising them. Not in
  the prompt. T8.4 therefore asserts the MCP wiring and prints a
  `[WARNING]` when `list_explores` never succeeds, because whether it does
  depends on the configured model.
- **Under simulated streaming, `firstTokenAt` stops meaning first token.**
  With a provider's `*_SUPPORTS_STREAMING=false`, `simulateStreamingMiddleware`
  runs the whole provider call and then emits, so
  `ai_prompt.response_timing.firstTokenAt` means first step completed. In the
  variant run it read 22 to 24 percent of the total only because the turn had
  4 steps. On a single-step answer it would land at the very end, and T2.2's
  `firstTokenAt < total` assertion cannot see that. A metric that silently
  changes meaning with the transport is worse than one that is missing,
  because dashboards keep charting it. T2.2 prints an observation comparing
  the first chunk with the average provider time per step; when they are
  close, streaming is simulated. It is deliberately not an assertion: the
  operator chooses the transport. Tool input stops streaming too: a tool call
  arrives whole as `tool-input-available`, with no `tool-input-start`.
- **`ai_agent_memory.pulled_count` is not a recall-health signal.** It
  counts only memories returned by the `loadProjectContext` tool (through
  `onEntriesLoaded` -> `incrementAiAgentMemoryPulls`). That is an optional
  search the model has no reason to make when the memory already sits in
  its first message, because `agentV2` `getMemoryBlock` injects every active
  memory into it as an `<ld-memories>` block. So a healthy recall reports
  `pulled_count` 0, and anyone reading that column as recall health will
  conclude memory is broken while it works. `cited_count` counts the
  model's `<ld-mem-cite>` markers. T7.1 asserts the injection itself from
  the backend's debug log and only reports both counts. Product angle: with
  injection unconditional, `pulled_count` may be close to dead as a metric.
- **Tool argument schemas are safe from the `oneOf` rejection today only by
  accident. This is a live tripwire.** `@ai-sdk/openai` adds `strict` to a
  function tool only when the tool itself sets it (`...tool.strict != null ?
  { strict: tool.strict } : {}`), and no Lightdash tool does. Structured
  outputs are different: their `response_format` takes `strictJsonSchema`,
  which defaults to true. So the 38 `z.discriminatedUnion` uses in tool
  argument schemas are sent non-strict and pass today. They stop being safe
  the day anyone opts a tool into `strict: true`, and the backend regression
  test does not cover them: it checks structured outputs only.
- **The memories onboarding tour blocks the agent page until dismissed.** It
  shows once per user (stored in `user_onboarding`) whenever memories exist,
  and its overlay intercepts clicks, including on the Memories button it
  points at. T7.1 presses Skip and puts the user's tour state back.
- **`mcp_tool_call` rows are eventually consistent.**
  `McpService.recordToolCall` writes them fire-and-forget, after the
  response it records. Anything reading them must poll; T8.3 once passed
  only by timing luck.
- **F5 cannot exist in an organization that already has a project.** The
  playground ensure endpoint provisions only into an empty organization;
  otherwise it returns the organization's first project and creates
  nothing. No flag or setting changes this, so T5.2 and T6.3 skip in the
  seed org.
- **A clicked verified question is matched against different text from the
  question.** The new-thread page offers each verified question as a
  suggestion, and a click sends its text as a new thread's first prompt.
  Retrieval embeds that prompt and compares it with the chart's embedding,
  which `embedArtifactVersion` makes from the title and description, not from
  the question. The question is not user-written: the question job writes it
  from the same title and description, and it is the only writer. Nothing
  ties the two texts together beyond that. In T3.2's first live run the
  click did retrieve its chart, but at similarity 0.706 against the 0.6
  threshold, the smallest margin of the three questions (the exact text
  scored 1, the question that made the chart 0.903). If a generated question
  scores below the threshold, clicking it answers without the verified chart.
  T3.2 warns when that happens.

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `E2E_AI_SITE_URL` | `http://localhost:3000` | App under test. Not `SITE_URL`, which is the backend's public URL and may be unreachable from the runner. |
| `DATABASE_URL` or `PG*` | the `PG*` env | Postgres the backend uses; tests read the ledger directly. |
| `E2E_AI_BACKEND_LOG` | unset | File receiving the API process stdout, for the checks only the backend log can answer (the attribution of `ai.usage` lines, clarify outcomes). When set, the backend must run with `LIGHTDASH_LOG_FORMAT=json`; unset means those checks are reported skipped. |
| `E2E_AI_CHROMIUM_EXECUTABLE` | Playwright's Chromium if installed, else the newest cached `chromium-*` build | Browser binary, to avoid a download. |
| `E2E_AI_OPT_IN` | unset | `1` runs the opt-in (O) tests. |
| `E2E_AI_MAILPIT_URL` | unset | Mailpit base URL (e.g. `http://localhost:8025`) when the backend mails through it. T8.1 then reads the delivered message; unset means that check is reported skipped. |

Screenshot-based features (image and PDF deliveries, unfurls) log the headless
browser in through `INTERNAL_LIGHTDASH_HOST`, which defaults to `SITE_URL`.
When that points at an unreachable host, such as a tunnel that is down, they
fail. No test depends on them: T8.1 sends a CSV delivery.
