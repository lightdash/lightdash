---
name: debug
description: Debug the Lightdash app using PM2 logs, Spotlight traces, and browser automation. Use when investigating issues, tracking down bugs, understanding request flow, or correlating frontend actions with backend behavior.
allowed-tools: Bash, Read, mcp__spotlight__search_traces, mcp__spotlight__get_traces, mcp__spotlight__search_errors, mcp__spotlight__search_logs, mcp__chrome-devtools__*
---

# Debugging Lightdash

## Prerequisites

Ensure dev environment is running:

```bash
/docker-dev              # Start Docker services
pnpm pm2:start           # Start all PM2 processes including Spotlight
```

- **Frontend**: http://localhost:3000
- **API**: http://localhost:8080
- **Spotlight UI**: http://localhost:8969
- **Test user**: demo@lightdash.com / demo_password!

## Debug Workflow

Copy this checklist and track progress:

```
Debug Progress:
- [ ] Step 1: Identify the symptom
- [ ] Step 2: Gather evidence
- [ ] Step 3: Correlate traces
- [ ] Step 4: Identify root cause
- [ ] Step 5: Fix and verify
```

### Step 1: Identify the symptom

Determine which path to follow:

**API error (4xx/5xx)?** → Go to Step 2a
**Slow response?** → Go to Step 2b
**UI bug or visual issue?** → Go to Step 2c
**Unknown / need to explore?** → Go to Step 2d

### Step 2a: API error

```bash
pnpm exec pm2 logs lightdash-api --lines 30 --nostream
```

Look for the failing request and note the trace ID (first 8 chars of the bracketed ID).

```
mcp__spotlight__search_errors filters: {"timeWindow": 300}
mcp__spotlight__get_traces traceId: "<8-char-prefix>"
```

Review the span tree for the failure point. → Continue to Step 4.

### Step 2b: Slow response

```
mcp__spotlight__search_traces filters: {"timeWindow": 300}
```

Find the slow trace, then get the span breakdown:

```
mcp__spotlight__get_traces traceId: "<trace-id>"
```

Look for: slow `db.*` spans, N+1 patterns (many similar queries), large gaps between spans. → Continue to Step 4.

### Step 2c: UI bug

```
mcp__chrome-devtools__new_page url: "http://localhost:3000"
mcp__chrome-devtools__take_snapshot
mcp__chrome-devtools__take_screenshot
```

Reproduce the issue, then check for client-side errors:

```
mcp__chrome-devtools__list_console_messages
mcp__chrome-devtools__list_network_requests
```

If a failed API call is involved, get its trace ID from PM2 logs. → Continue to Step 3.

### Step 2d: Exploratory

Gather broad state:

```
mcp__spotlight__search_traces filters: {"timeWindow": 300}
mcp__spotlight__search_errors filters: {"timeWindow": 300}
mcp__spotlight__search_logs filters: {"timeWindow": 300}
```

```bash
pnpm exec pm2 logs lightdash-api --lines 30 --nostream
```

Look for anomalies, then follow the relevant path above.

### Step 3: Correlate traces

Bridge frontend and backend by finding the trace ID:

```bash
pnpm exec pm2 logs lightdash-api --lines 20 --nostream
```

```
mcp__spotlight__get_traces traceId: "<8-char-prefix>"
```

The span tree shows the full request lifecycle: middleware → route handler → database queries → response.

### Step 4: Identify root cause

With evidence gathered, analyze:
- **Span tree**: Which span failed or took longest?
- **Error stack trace**: What code path threw?
- **Request attributes**: Were params/headers correct?
- **Database spans**: Were queries correct and performant?

### Step 5: Fix and verify

After making code changes:

1. Reproduce the original issue
2. Check that the symptom is resolved
3. **Verify with traces**: run `mcp__spotlight__search_errors filters: {"timeWindow": 60}` to confirm no new errors
4. If still failing → return to Step 2 with new evidence

## Tool Reference

For detailed tool syntax and commands: See [TOOLS.md](TOOLS.md)

## Scenario Examples

For end-to-end walkthroughs with checklists: See [SCENARIOS.md](SCENARIOS.md)
