# Debug Tools Reference

## Contents
- PM2 log commands
- Spotlight MCP tools
- Chrome DevTools MCP tools
- Trace attributes
- Quick commands

## PM2 Log Commands

| Command | Purpose |
|---------|---------|
| `pnpm pm2:logs` | Stream all logs (Ctrl+C to exit) |
| `pnpm pm2:logs:api` | API server logs only |
| `pnpm pm2:logs:scheduler` | Background job scheduler logs |
| `pnpm pm2:logs:frontend` | Vite dev server logs |
| `pnpm pm2:logs:spotlight` | Spotlight sidecar logs |
| `pnpm pm2:status` | Check process status |
| `pnpm pm2:restart:api` | Restart API server |

Non-blocking log viewing (last N lines, no streaming):

```bash
pnpm exec pm2 logs lightdash-api --lines 20 --nostream
```

### Log format

Logs include a 32-character trace ID for correlation:

```
[700aa55e784a437aa97de9b8c5c3ed3a] GET /api/v1/health 200 - 37 ms
```

Use the first 8 characters (e.g., `700aa55e`) to look up traces in Spotlight.

## Spotlight MCP Tools

### mcp__spotlight__search_traces

Search recent traces. Returns trace ID, endpoint, duration, span count.

```
mcp__spotlight__search_traces with filters: {"timeWindow": 300}
```

### mcp__spotlight__get_traces

Get full span tree with timing breakdown for a specific trace.

```
mcp__spotlight__get_traces with traceId: "700aa55e"
```

Example output:

```
GET /api/v1/health [816224a9 · 39ms]
   ├─ select * from "knex_migrations" [db · 8ms]
   ├─ select * from "organizations" [db · 2ms]
   ├─ session [middleware.express · 1ms]
   └─ /api/v1/health [request_handler.express · 0ms]
```

### mcp__spotlight__search_errors

Find runtime errors and exceptions with stack traces.

```
mcp__spotlight__search_errors with filters: {"timeWindow": 300}
```

### mcp__spotlight__search_logs

Find application log entries.

```
mcp__spotlight__search_logs with filters: {"timeWindow": 300}
```

## Chrome DevTools MCP Tools

### Pages

```
mcp__chrome-devtools__new_page with url: "http://localhost:3000/login"
mcp__chrome-devtools__navigate_page with url: "http://localhost:3000", type: "url"
mcp__chrome-devtools__list_pages
mcp__chrome-devtools__select_page with pageId: 1
mcp__chrome-devtools__close_page with pageId: 2
```

### Snapshots and screenshots

```
mcp__chrome-devtools__take_snapshot          # Accessibility tree with uid identifiers
mcp__chrome-devtools__take_screenshot        # Visual screenshot
mcp__chrome-devtools__take_screenshot with fullPage: true
```

### Interacting with elements

Use `uid` values from `take_snapshot` output:

```
mcp__chrome-devtools__click with uid: "1_5"
mcp__chrome-devtools__fill with uid: "1_4", value: "test@example.com"
mcp__chrome-devtools__hover with uid: "1_3"
```

### Console and network

```
mcp__chrome-devtools__list_console_messages
mcp__chrome-devtools__list_network_requests
mcp__chrome-devtools__get_network_request with reqid: 123
```

## Trace Attributes

| Attribute | Example | Description |
|-----------|---------|-------------|
| `http.route` | `/api/v1/projects/:projectUuid` | Route pattern |
| `http.status_code` | `200` | Response status |
| `http.method` | `GET` | HTTP method |
| `sentry.op` | `db`, `http.server` | Operation type |
| `db.system` | `postgresql` | Database type |
