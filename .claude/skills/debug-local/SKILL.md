---
name: debug-local
metadata:
  internal: true
description: Debug the Lightdash app using PM2 logs, Maple traces, and browser automation. Use when investigating issues, tracking down bugs, understanding request flow, or correlating frontend actions with backend behavior.
---

# Debugging Lightdash

## Iron Law

**NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST.**

Do not edit application code until you have a confirmed root cause hypothesis backed by evidence (logs, traces, reproduction). Fixing symptoms creates whack-a-mole debugging.

---

## Phase 1: Gather Evidence

Before forming any hypothesis, collect facts.

### 1. Collect symptoms

Read error messages, stack traces, and reproduction steps. If the user hasn't provided enough context, ask ONE clarifying question.

### 2. Check recent changes

```bash
git log --oneline -20 -- <affected-files>
```

Was this working before? A regression means the root cause is in the diff.

### 3. Check logs and traces

```bash
pnpm exec pm2 logs lightdash-api --lines 50 --nostream
```

Then query Maple (local mode ingests OTLP traces from the API and scheduler):

```bash
maple services --format table       # per-service throughput and error rate
maple errors --since 5m             # errors grouped by fingerprint
maple traces --since 5m --errors    # recent traces containing errors
maple trace <trace-id>              # full span tree + correlated logs
maple slow-traces --since 15m       # slowest traces
```

The CLI defaults to port 4318, so point it at this instance first:
`export MAPLE_LOCAL_URL="http://127.0.0.1:${MAPLE_PORT:-4320}"`. See
[Trace Lookup](#trace-lookup-maple-cli) for the full filter set.

### 4. Reproduce

Can you trigger the bug deterministically? Use browser automation or curl to reproduce. If you can't reproduce, gather more evidence before proceeding.

### 5. Read the code

Trace the code path from the symptom back to potential causes. Use Grep to find all references, Read to understand the logic.

**Output:** State your root cause hypothesis — a specific, testable claim about what is wrong and why.

---

## Phase 2: Pattern Matching

Check if the bug matches a known Lightdash pattern:

| Pattern | Signature | Where to look |
|---------|-----------|---------------|
| Permission error | 403 Forbidden | CASL abilities in `projectMemberAbility.ts`, `organizationMemberAbility.ts` |
| Slow query / N+1 | Response >1s, many db spans | `maple trace <id>` span tree — count db.* spans, check for loops |
| Stale explore cache | Shows old columns/metrics | `cached_explores` table, `CompileService` |
| Migration issue | Column not found, schema mismatch | `packages/backend/src/database/migrations/`, check rollback |
| Scheduler job failure | Job not running, stuck | PM2 scheduler logs, `graphile_worker.jobs` table |
| Frontend stale data | UI shows old data after mutation | TanStack Query cache invalidation, check `queryClient.invalidateQueries` |
| Race condition | Intermittent, timing-dependent | Concurrent access to shared state, missing `await` |
| Cross-service file issue | File not found in worker/headless | Must use S3 via `FileStorageClient`, not local filesystem |
| Config drift | Works locally, fails in CI/staging | Env vars, `.env.development.local` vs container env |
| Null propagation | TypeError, cannot read property | Missing guards on optional values, Knex `.first()` returning undefined |

Also check:
- `git log` for prior fixes in the same area — recurring bugs in the same files are an architectural smell
- Whether the issue is in common, backend, or frontend — misattributing the layer wastes time

---

## Phase 3: Hypothesis Testing

Before writing ANY fix, verify your hypothesis.

1. **Confirm:** Add a temporary log, assertion, or use Maple/PM2 to check the suspected root cause. Reproduce. Does evidence match?

2. **If wrong:** Return to Phase 1. Gather more evidence. Do not guess.

3. **3-strike rule:** If 3 hypotheses fail, **STOP**. Ask the user:
   - Continue with a new hypothesis (describe it)
   - Escalate for human review
   - Add instrumentation and wait to catch it next time

---

## Phase 4: Fix

Once root cause is confirmed:

1. **Fix the root cause, not the symptom.** Smallest change that eliminates the actual problem.

2. **Minimal diff.** Fewest files touched, fewest lines changed. Do not refactor adjacent code.

3. **Write a regression test** that fails without the fix and passes with it.

4. **Run the relevant test suite.** Paste output.

5. **Blast radius check:** If fix touches >5 files, pause and confirm with the user before proceeding.

---

## Phase 5: Verify & Report

**Reproduce the original bug scenario and confirm it's fixed.** This is not optional.

Output a structured debug report:

```
DEBUG REPORT
════════════════════════════════════════
Symptom:         [what the user observed]
Root cause:      [what was actually wrong]
Fix:             [what was changed, with file:line references]
Evidence:        [test output, trace showing fix works]
Regression test: [file:line of the new test]
Status:          DONE | DONE_WITH_CONCERNS | BLOCKED
════════════════════════════════════════
```

Status definitions:
- **DONE** — root cause found, fix applied, regression test written, tests pass
- **DONE_WITH_CONCERNS** — fixed but cannot fully verify (e.g., intermittent bug, needs staging)
- **BLOCKED** — root cause unclear after investigation, escalated to user

---

## Prerequisites

Ensure the development environment is running:

```bash
/docker-dev              # Start Docker services (postgres, minio, etc.)
pnpm pm2:start           # Start all PM2 processes including Maple
pnpm pm2:status          # Verify all processes are online
```

Services:
- **Frontend**: http://localhost:3000
- **API**: http://localhost:8080
- **Maple trace UI**: http://localhost:4320

## Tools Reference

### Server Logs (PM2)

```bash
pnpm pm2:logs              # Stream all logs (Ctrl+C to exit)
pnpm pm2:logs:api          # API server logs only
pnpm pm2:logs:scheduler    # Background job scheduler logs
pnpm pm2:logs:frontend     # Vite dev server logs
pnpm pm2:logs:maple        # Maple tracing server logs
```

For non-blocking log viewing (last N lines):

```bash
pnpm exec pm2 logs lightdash-api --lines 20 --nostream
```

#### Log format

Lightdash logs include a 32-character trace ID for correlation:

```
[700aa55e784a437aa97de9b8c5c3ed3a] GET /api/v1/health 200 - 37 ms
[4d40816e5a7d433e88f99008de5f4be5] GET /api/v1/user/login-options 200 - 2 ms
```

Pass the full 32-character ID to `maple trace` to pull up the request.

### Trace Lookup (Maple CLI)

Maple local mode stores traces, logs, and metrics in an embedded ClickHouse and
exposes them through the `maple` CLI. Every command takes `--since
<30m|1h|24h|7d>` for the window. Output is JSON — pipe through `jq` to narrow it.
`--format table` only applies to flat row sets (`services`, `query`); the other
commands say so and fall back to JSON.

Set the target once per shell — the CLI defaults to port 4318, and each worktree
runs its own server on its slot port:

```bash
export MAPLE_LOCAL_URL="http://127.0.0.1:${MAPLE_PORT:-4320}"
```

#### List services

```bash
maple services --format table
```

Throughput, error rate, and P95 latency per service. The API reports as
`$LD_INSTANCE_ID` (`lightdash` by default) and the worker as
`$LD_INSTANCE_ID-scheduler`.

#### List recent traces

```bash
maple traces --since 5m | jq '.traces[] | {traceId, spanName, durationMs}'
maple traces --since 1h --errors --min-duration-ms 500
maple slow-traces --since 15m
```

Filters: `--span-name <substr>`, `--http-method`, `--errors`,
`--min-duration-ms`, `--max-duration-ms`, `--service`, `--limit`.

#### Get trace details

```bash
maple trace 700aa55e784a437aa97de9b8c5c3ed3a
```

Returns the full span tree plus the logs correlated to that trace.

#### Search for errors

```bash
maple errors --since 30m        # grouped by fingerprint
maple error <fingerprint-hash>  # sample traces + timeseries
```

#### Search logs

```bash
maple logs --since 5m --severity ERROR
maple logs --trace-id 700aa55e784a437aa97de9b8c5c3ed3a
maple logs -q "compile" --since 1h
```

#### Raw SQL escape hatch

```bash
maple query "SELECT ServiceName, count() FROM traces GROUP BY ServiceName"
```

### Browser Debugging (Chrome DevTools MCP)

Use the Chrome DevTools MCP tools for browser automation:

#### Opening pages

```
mcp__chrome-devtools__new_page with url: "http://localhost:3000/login"
mcp__chrome-devtools__navigate_page with url: "http://localhost:3000", type: "url"
```

#### Taking snapshots

```
mcp__chrome-devtools__take_snapshot
```

Returns a text snapshot of the page based on the accessibility tree with unique `uid` identifiers for each element.

#### Interacting with elements

```
mcp__chrome-devtools__click with uid: "1_5"
mcp__chrome-devtools__fill with uid: "1_4", value: "test@example.com"
mcp__chrome-devtools__hover with uid: "1_3"
```

#### Screenshots

```
mcp__chrome-devtools__take_screenshot
mcp__chrome-devtools__take_screenshot with fullPage: true
mcp__chrome-devtools__take_screenshot with filePath: "/tmp/debug.png"
```

#### Console and network

```
mcp__chrome-devtools__list_console_messages
mcp__chrome-devtools__list_network_requests
mcp__chrome-devtools__get_network_request with reqid: 123
```

#### Page management

```
mcp__chrome-devtools__list_pages
mcp__chrome-devtools__select_page with pageId: 1
mcp__chrome-devtools__close_page with pageId: 2
```

### Database Inspection

```bash
# Check table schema
psql -c "\d <table_name>"

# Query data directly
psql -c "SELECT * FROM <table> WHERE <condition> LIMIT 5;"

# Check scheduler jobs
psql -c "SELECT id, task_identifier, attempts, last_error FROM graphile_worker.jobs WHERE last_error IS NOT NULL LIMIT 10;"
```

## Trace Attributes (Wide Events)

Traces contain contextual attributes beyond timing:

| Attribute | Example | Description |
|-----------|---------|-------------|
| `http.route` | `/api/v1/projects/:projectUuid` | Route pattern |
| `http.status_code` | `200` | Response status |
| `http.method` | `GET` | HTTP method |
| `sentry.op` | `db`, `http.server` | Operation type |
| `db.system` | `postgresql` | Database type |

## Common Debugging Scenarios

| Symptom | What to check |
|---------|---------------|
| 401 Unauthorized | Trace auth middleware, check session/JWT spans |
| 403 Forbidden | Check user ability/permissions in trace attributes, review CASL abilities |
| 404 Not Found | Verify route exists, check resource lookup spans |
| 400 Bad Request | Look for validation errors in trace/error logs |
| Slow response | Check span breakdown for slow db.* or external calls, count db spans for N+1 |
| Empty results | Verify query parameters, check db query spans |
| 500 Server Error | Use `search_errors` for stack trace and context |
| UI not updating | Check TanStack Query devtools, verify cache invalidation after mutations |
| Scheduler not running | Check `pnpm pm2:logs:scheduler`, query `graphile_worker.jobs` table |

## Quick Commands Reference

| Action | Command |
|--------|---------|
| View all logs | `pnpm pm2:logs` |
| View API logs (non-blocking) | `pnpm exec pm2 logs lightdash-api --lines 20 --nostream` |
| Check process status | `pnpm pm2:status` |
| Restart API | `pnpm pm2:restart:api` |
| Recent traces | `maple traces --since 5m` |
| Trace details | `maple trace <full-trace-id>` |
| Recent errors | `maple errors --since 5m` |
| Browser snapshot | `mcp__chrome-devtools__take_snapshot` |
| Open Maple trace UI | http://localhost:4320 |

## Cross-Agent Validation

Use another AI agent to validate your findings, challenge your conclusions, and provide independent evidence. This is not just for when you're stuck — actively seek validation throughout the debugging process to ensure your analysis is sound.

### Detect your environment

```bash
which claude 2>/dev/null && echo "HAS_CLAUDE=true" || echo "HAS_CLAUDE=false"
which codex 2>/dev/null && echo "HAS_CODEX=true" || echo "HAS_CODEX=false"
```

### If you are Claude → ask Codex

```bash
codex exec "Given this context from a Lightdash debugging session:

<context>
[paste relevant logs, traces, error messages, or code snippets]
</context>

<question>
[your specific question — e.g., 'Does this trace confirm that the query cache is being bypassed?' or 'Given this stack trace, is my conclusion that the middleware short-circuits before auth correct?']
</question>"
```

### If you are Codex → ask Claude

```bash
claude -p "Given this context from a Lightdash debugging session:

<context>
[paste relevant logs, traces, error messages, or code snippets]
</context>

<question>
[your specific question]
</question>"
```

### When to consult

- **Validate a hypothesis**: Before concluding root cause, ask the other agent if the evidence supports your theory or if there's an alternative explanation
- **Verify your interpretation of data**: When reading traces, logs, or query output — confirm you're reading it correctly
- **Challenge your fix**: Before suggesting a code change, ask whether the fix actually addresses the root cause or just masks a symptom
- **Cross-check complex logic**: When the issue involves multiple systems (frontend + API + database + permissions), get an independent read on the interaction
- **Justify a conclusion**: If you're about to tell the user "X is the cause", make sure another perspective agrees — or surface the disagreement

### Guidelines

- **Set a 5-minute timeout**: Codex can take a while to respond. When running `codex exec` via the Bash tool, set the Bash timeout to 300000ms (5 minutes) to avoid premature termination. Do NOT pass `--timeout` to `codex exec` itself — it doesn't support that flag.
- **Be specific**: Include the actual error, trace output, or code snippet — not just a vague description
- **Ask for validation, not just answers**: "Does this evidence support my conclusion that X?" is better than "What's wrong?"
- **Include your current hypothesis**: Let the other agent confirm or challenge it, rather than starting from scratch
- **Include what you've already ruled out**: This avoids duplicate investigation and focuses the consultation
- **Always report back to the user**: When you consult another agent, tell the user you did so. Summarize what you asked, what the other agent found, and whether you agree with their assessment. If there's a disagreement, present both perspectives and the supporting evidence for each. The user should never be unaware that another agent was consulted.

## Test User Credentials

For testing authenticated flows:
- **Email**: demo@lightdash.com
- **Password**: demo_password!

## API Access (Personal Access Token)

**Prefer this method over using `fetch()` via Chrome DevTools MCP for API calls.** `curl` with the PAT is faster, more reliable, and doesn't require a browser session or page context. Reserve browser MCP tools for UI interaction and visual debugging only.

A dev PAT is auto-provisioned by the seed data. Use it for direct API calls without browser login:

```bash
# Source the env file to get LDPAT and LIGHTDASH_API_URL
source .env.development.local

# Example: list projects
curl -s -H "Authorization: ApiKey $LDPAT" "$LIGHTDASH_API_URL/api/v1/org/projects" | jq

# Example: get user info
curl -s -H "Authorization: ApiKey $LDPAT" "$LIGHTDASH_API_URL/api/v1/user" | jq
```

The token (`ldpat_deadbeefdeadbeefdeadbeefdeadbeef`) is defined in `SEED_PAT` from `@lightdash/common` and inserted during database seeding. It belongs to the admin user (`demo@lightdash.com`) and never expires.
