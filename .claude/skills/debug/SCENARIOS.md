# Debug Scenarios

## Contents
- Login failure
- Slow API call
- Form submission error
- Capturing state for investigation
- Common symptoms reference

## Scenario: Login Failure

```
Debug Progress:
- [ ] Step 1: Open login page and reproduce
- [ ] Step 2: Get trace ID from logs
- [ ] Step 3: Inspect trace for root cause
- [ ] Step 4: Check errors for stack trace
- [ ] Step 5: Verify fix
```

**Step 1: Reproduce**

```
mcp__chrome-devtools__new_page url: "http://localhost:3000/login"
mcp__chrome-devtools__take_snapshot
mcp__chrome-devtools__fill uid: "<email_uid>", value: "demo@lightdash.com"
mcp__chrome-devtools__click uid: "<continue_uid>"
mcp__chrome-devtools__take_snapshot
mcp__chrome-devtools__fill uid: "<password_uid>", value: "wrong_password"
mcp__chrome-devtools__click uid: "<signin_uid>"
```

**Step 2: Get trace ID**

```bash
pnpm exec pm2 logs lightdash-api --lines 10 --nostream
# Look for: [a1b2c3d4...] POST /api/v1/user/login/password 401 - 85ms
```

**Step 3: Inspect trace**

```
mcp__spotlight__get_traces traceId: "a1b2c3d4"
```

Review the span tree for auth middleware failures, session issues, or database lookup problems.

**Step 4: Check errors**

```
mcp__spotlight__search_errors filters: {"timeWindow": 60}
```

If no errors found, the 401 may be intentional (wrong credentials). Check the trace attributes for `http.status_code` and auth-related spans.

**Step 5: Verify fix**

After making code changes, repeat Steps 1-4. Confirm the trace now shows a 200 status and the login succeeds in the browser.

## Scenario: Slow API Call

```
Debug Progress:
- [ ] Step 1: Identify slow traces
- [ ] Step 2: Get span breakdown
- [ ] Step 3: Identify bottleneck
- [ ] Step 4: Verify fix
```

**Step 1: Identify slow traces**

```
mcp__spotlight__search_traces filters: {"timeWindow": 300}
```

Sort by duration, look for outliers.

**Step 2: Get span breakdown**

```
mcp__spotlight__get_traces traceId: "<trace-id>"
```

**Step 3: Identify bottleneck**

Look for:
- `db.*` spans with high duration → slow queries, missing indexes, N+1 patterns
- Multiple similar `db.*` spans → N+1 query problem
- `middleware.express` overhead → inefficient middleware chain
- Large gaps between spans → CPU-bound processing

**Step 4: Verify fix**

After changes, reproduce the same request and compare trace durations. The bottleneck span should show reduced time.

## Scenario: Form Submission Error

```
Debug Progress:
- [ ] Step 1: Set up error monitoring
- [ ] Step 2: Reproduce in browser
- [ ] Step 3: Correlate error with trace
- [ ] Step 4: Inspect network and console
- [ ] Step 5: Verify fix
```

**Step 1: Set up error monitoring**

```
mcp__spotlight__search_errors filters: {"timeWindow": 60}
```

Note existing errors so you can distinguish new ones.

**Step 2: Reproduce in browser**

```
mcp__chrome-devtools__click uid: "<submit_button_uid>"
mcp__chrome-devtools__take_snapshot
```

**Step 3: Correlate error with trace**

```
mcp__spotlight__search_errors filters: {"timeWindow": 60}
mcp__spotlight__search_traces filters: {"timeWindow": 60}
mcp__spotlight__get_traces traceId: "<trace-id>"
```

Match the new error to its trace for full context.

**Step 4: Inspect network and console**

```
mcp__chrome-devtools__list_network_requests
mcp__chrome-devtools__list_console_messages
```

Check for failed API calls, validation errors, or client-side exceptions.

**Step 5: Verify fix**

Reproduce the submission again. Confirm no new errors in Spotlight and the form succeeds in the browser.

## Scenario: Capturing State

When you need a comprehensive snapshot of current state:

```
mcp__chrome-devtools__take_screenshot
mcp__chrome-devtools__take_snapshot
mcp__chrome-devtools__list_console_messages
mcp__chrome-devtools__list_network_requests
mcp__spotlight__search_errors filters: {"timeWindow": 60}
mcp__spotlight__search_traces filters: {"timeWindow": 60}
```

## Common Symptoms Reference

| Symptom | What to check |
|---------|---------------|
| 401 Unauthorized | Trace auth middleware, check session/JWT spans |
| 403 Forbidden | Check user ability/permissions in trace attributes |
| 404 Not Found | Verify route exists, check resource lookup spans |
| 400 Bad Request | Look for validation errors in trace/error logs |
| Slow response | Check span breakdown for slow `db.*` or external calls |
| Empty results | Verify query parameters, check db query spans |
| 500 Server Error | Use `search_errors` for stack trace and context |
