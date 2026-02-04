---
name: debug
description: Debug the Lightdash app using PM2 logs, Spotlight traces, and browser automation. Use when investigating issues, tracking down bugs, understanding request flow, or correlating frontend actions with backend behavior.
allowed-tools: Bash, Read, mcp__spotlight__search_traces, mcp__spotlight__get_traces, mcp__spotlight__search_errors, mcp__spotlight__search_logs, mcp__chrome-devtools__*
---

# Debugging Lightdash

This skill helps you debug Lightdash using PM2 logs, Spotlight telemetry, and browser automation.

## Prerequisites

Ensure the development environment is running:

```bash
/docker-dev              # Start Docker services (postgres, minio, etc.)
pnpm pm2:start           # Start all PM2 processes including Spotlight
pnpm pm2:status          # Verify all processes are online
```

Services:
- **Frontend**: http://localhost:3000
- **API**: http://localhost:8080
- **Spotlight UI**: http://localhost:8969

## Server Logs (PM2)

### Viewing logs

```bash
pnpm pm2:logs              # Stream all logs (Ctrl+C to exit)
pnpm pm2:logs:api          # API server logs only
pnpm pm2:logs:scheduler    # Background job scheduler logs
pnpm pm2:logs:frontend     # Vite dev server logs
pnpm pm2:logs:spotlight    # Spotlight sidecar logs
```

For non-blocking log viewing (last N lines):

```bash
pnpm exec pm2 logs lightdash-api --lines 20 --nostream
```

### Log format

Lightdash logs include a 32-character trace ID for correlation:

```
[700aa55e784a437aa97de9b8c5c3ed3a] GET /api/v1/health 200 - 37 ms
[4d40816e5a7d433e88f99008de5f4be5] GET /api/v1/user/login-options 200 - 2 ms
```

Use the first 8 characters (e.g., `700aa55e`) to look up traces in Spotlight.

## Trace Lookup (Spotlight MCP)

Use the Spotlight MCP tools to query telemetry programmatically:

### List recent traces

```
mcp__spotlight__search_traces with filters: {"timeWindow": 300}
```

Returns summary of recent traces with trace ID, endpoint, duration, span count.

### Get trace details

```
mcp__spotlight__get_traces with traceId: "700aa55e"
```

Returns the full span tree with timing breakdown:

```
GET /api/v1/health [816224a9 · 39ms]
   ├─ select * from "knex_migrations" [db · 8ms]
   ├─ select * from "organizations" [db · 2ms]
   ├─ session [middleware.express · 1ms]
   └─ /api/v1/health [request_handler.express · 0ms]
```

### Search for errors

```
mcp__spotlight__search_errors with filters: {"timeWindow": 300}
```

Returns runtime errors and exceptions with stack traces.

### Search logs

```
mcp__spotlight__search_logs with filters: {"timeWindow": 300}
```

Returns application log entries.

## Browser Debugging (Chrome DevTools MCP)

Use the Chrome DevTools MCP tools for browser automation:

### Opening pages

```
mcp__chrome-devtools__new_page with url: "http://localhost:3000/login"
mcp__chrome-devtools__navigate_page with url: "http://localhost:3000", type: "url"
```

### Taking snapshots

```
mcp__chrome-devtools__take_snapshot
```

Returns a text snapshot of the page based on the accessibility tree with unique `uid` identifiers for each element.

### Interacting with elements

```
mcp__chrome-devtools__click with uid: "1_5"
mcp__chrome-devtools__fill with uid: "1_4", value: "test@example.com"
mcp__chrome-devtools__hover with uid: "1_3"
```

### Screenshots

```
mcp__chrome-devtools__take_screenshot
mcp__chrome-devtools__take_screenshot with fullPage: true
mcp__chrome-devtools__take_screenshot with filePath: "/tmp/debug.png"
```

### Console and network

```
mcp__chrome-devtools__list_console_messages
mcp__chrome-devtools__list_network_requests
mcp__chrome-devtools__get_network_request with reqid: 123
```

### Page management

```
mcp__chrome-devtools__list_pages
mcp__chrome-devtools__select_page with pageId: 1
mcp__chrome-devtools__close_page with pageId: 2
```

## End-to-End Debug Workflow

### Example: Debug a login failure

```
# 1. Open the login page
mcp__chrome-devtools__new_page url: "http://localhost:3000/login"

# 2. Take a snapshot to see the form
mcp__chrome-devtools__take_snapshot

# 3. Fill the form and submit (use uids from snapshot)
mcp__chrome-devtools__fill uid: "1_4", value: "test@example.com"
mcp__chrome-devtools__click uid: "1_5"  # Continue button
mcp__chrome-devtools__take_snapshot     # See password field
mcp__chrome-devtools__fill uid: "2_2", value: "wrongpassword"
mcp__chrome-devtools__click uid: "2_5"  # Sign in button

# 4. Check PM2 logs for the trace ID
pnpm exec pm2 logs lightdash-api --lines 10 --nostream | grep POST

# Output: [a1b2c3d4...] POST /api/v1/user/login/password 401 - 85ms

# 5. Look up the full trace in Spotlight
mcp__spotlight__get_traces traceId: "a1b2c3d4"

# 6. Check for errors
mcp__spotlight__search_errors filters: {"timeWindow": 60}
```

### Example: Debug a slow API call

```
# 1. Check recent traces sorted by performance
mcp__spotlight__search_traces filters: {"timeWindow": 300}

# 2. Find the slow trace and get details
mcp__spotlight__get_traces traceId: "<trace-id>"

# 3. Look at the span breakdown to find bottlenecks
# - db.* spans show database query times
# - middleware.express shows middleware overhead
# - Look for N+1 queries, missing indexes, large result sets
```

### Example: Debug a form submission error

```
# 1. Watch for errors in real-time
mcp__spotlight__search_errors filters: {"timeWindow": 60}

# 2. Reproduce the issue in the browser
mcp__chrome-devtools__click uid: "submit_button_uid"

# 3. Check errors again immediately
mcp__spotlight__search_errors filters: {"timeWindow": 60}

# 4. Get the trace for context
mcp__spotlight__search_traces filters: {"timeWindow": 60}
mcp__spotlight__get_traces traceId: "<trace-id>"
```

### Example: Capture state for investigation

```
mcp__chrome-devtools__take_screenshot filePath: "/tmp/debug-state.png"
mcp__chrome-devtools__take_snapshot
mcp__chrome-devtools__list_console_messages
mcp__chrome-devtools__list_network_requests
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
| 403 Forbidden | Check user ability/permissions in trace attributes |
| 404 Not Found | Verify route exists, check resource lookup spans |
| 400 Bad Request | Look for validation errors in trace/error logs |
| Slow response | Check span breakdown for slow db.* or external calls |
| Empty results | Verify query parameters, check db query spans |
| 500 Server Error | Use `search_errors` for stack trace and context |

## Quick Commands Reference

| Action | Command |
|--------|---------|
| View all logs | `pnpm pm2:logs` |
| View API logs (non-blocking) | `pnpm exec pm2 logs lightdash-api --lines 20 --nostream` |
| Check process status | `pnpm pm2:status` |
| Restart API | `pnpm pm2:restart:api` |
| Recent traces | `mcp__spotlight__search_traces {"timeWindow": 300}` |
| Trace details | `mcp__spotlight__get_traces "<8-char-prefix>"` |
| Recent errors | `mcp__spotlight__search_errors {"timeWindow": 300}` |
| Browser snapshot | `mcp__chrome-devtools__take_snapshot` |
| Open Spotlight UI | http://localhost:8969 |

## Test User Credentials

For testing authenticated flows:
- **Email**: demo@lightdash.com
- **Password**: demo_password!
