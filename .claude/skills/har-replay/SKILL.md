---
name: har-replay
description: Replay a HAR file as a mock backend to reproduce frontend performance issues with production data. Use when asked to replay a HAR file, reproduce a dashboard with a HAR, or test frontend performance with captured traffic.
---

# HAR Replay

Replay a HAR file as a mock Lightdash backend so the frontend renders with exact production data. No database, warehouse, or authentication needed.

The user must provide a path to a `.har` file. If not provided as `$ARGUMENTS`, ask for it.

## Step 1: Analyze the HAR file

Run a Python script to extract key information from the HAR:

```python
import json, sys, re
from collections import Counter
from urllib.parse import urlparse

har_path = "$HAR_FILE_PATH"
with open(har_path) as f:
    har = json.load(f)

entries = har['log']['entries']

# Extract the page URL from the HAR pages section
page_path = None
pages = har['log'].get('pages', [])
for p in pages:
    title = p.get('title', '')
    parsed = urlparse(title)
    if parsed.path and parsed.path != '/':
        page_path = parsed.path
        break

# Fallback: extract from referer headers
if not page_path:
    for e in entries:
        for h in e['request']['headers']:
            if h['name'].lower() == 'referer':
                parsed = urlparse(h['value'])
                if parsed.path and parsed.path != '/':
                    page_path = parsed.path
                    break
        if page_path:
            break

# Find the origin (first API call)
origin = None
for e in entries:
    url = urlparse(e['request']['url'])
    if url.path.startswith('/api/'):
        origin = f"{url.scheme}://{url.netloc}"
        break

# Filter to origin entries only
api_entries = [e for e in entries if origin and origin in e['request']['url']]

# Find dashboard URL if present
dashboard_uuid = None
for e in api_entries:
    path = urlparse(e['request']['url']).path
    m = re.search(r'/dashboards/([0-9a-f-]{36})', path)
    if m:
        dashboard_uuid = m.group(1)
        break

# Find project UUID
project_uuid = None
for e in api_entries:
    path = urlparse(e['request']['url']).path
    m = re.search(r'/projects/([0-9a-f-]{36})', path)
    if m:
        project_uuid = m.group(1)
        break

# Count request types
methods = Counter()
api_paths = Counter()
has_base64 = False
post_endpoints_needing_body_match = []

for e in api_entries:
    method = e['request']['method']
    path = urlparse(e['request']['url']).path
    methods[method] += 1
    normalized = re.sub(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '{uuid}', path)
    api_paths[f'{method} {normalized}'] += 1
    if e['response']['content'].get('encoding') == 'base64':
        has_base64 = True

# Find POST endpoints with multiple entries (need body-based matching)
for key, count in api_paths.items():
    if key.startswith('POST') and count > 1:
        post_endpoints_needing_body_match.append((key, count))

print(f"Page path: {page_path}")
print(f"Origin: {origin}")
print(f"Total API entries: {len(api_entries)}")
print(f"Project UUID: {project_uuid}")
print(f"Dashboard UUID: {dashboard_uuid}")
print(f"Has base64 content: {has_base64}")
print(f"Methods: {dict(methods)}")
print(f"POST endpoints needing body match: {post_endpoints_needing_body_match}")
print()
print("API paths:")
for p, c in sorted(api_paths.items()):
    print(f"  {p}: {c}")
```

Report the findings to the user:
- Page path extracted from the HAR (this is the URL the user was viewing when the HAR was captured)
- Origin domain
- Number of API entries
- Notable POST endpoints that need body-based matching (e.g., `dashboard-chart` with multiple chart tiles)

## Step 2: Write a tailored replay server

Based on the analysis, write a replay server to `scripts/har-replay-server.ts`. The server must handle these concerns:

### Core structure

```typescript
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
```

Use only Node.js built-in modules. Run with `npx tsx scripts/har-replay-server.ts <har-path>`.

### HAR parsing rules

1. **Filter by origin**: Only index entries matching the detected origin domain
2. **Base64 decoding**: Check `entry.response.content.encoding === 'base64'` and decode with `Buffer.from(text, 'base64').toString('utf-8')`
3. **Skip pending poll responses**: For `GET /api/v2/projects/{uuid}/query/{uuid}` endpoints, parse the response body and skip entries where `results.status === 'pending'` — only keep the final `ready` response
4. **Normalize 304s to 200**: Serve `304` responses as `200` (they have full body in HAR)
5. **Strip transport headers**: Remove `:pseudo-headers`, `transfer-encoding`, `content-encoding`, `content-length` from response headers

### Request matching strategy

- **GET requests**: Match by exact `"METHOD /path?query"`. Fall back to path without query string.
- **POST `dashboard-chart`**: These all hit the same URL but carry different `chartUuid` in the request body. Index by `chartUuid` from the HAR request body, and match incoming requests by parsing their body.
- **POST `dashboard-sql-chart`**: Same pattern but with `savedSqlUuid`. If there's only one, exact path match works.
- **Other POST requests** (e.g., `availableFilters`): Usually unique paths, exact match works.
- **Any POST endpoint the analysis identified as having multiple entries to the same path**: Must use body-based matching on a distinguishing field.

### Server behavior

- Listen on port 3001
- Log every request with method, path, and whether it matched
- Return `{"status":"error","error":{"message":"HAR replay: no matching entry"}}` for 404s
- On startup, print the number of indexed responses and the dashboard URL to navigate to

## Step 3: Start the replay server and frontend

1. Kill any existing processes on port 3001
2. Start the replay server in the background:
   ```bash
   npx tsx scripts/har-replay-server.ts <har-path>
   ```
3. Start the Vite frontend dev server pointing at the replay server:
   ```bash
   PORT=3001 pnpm -F frontend dev
   ```
4. Wait for both to be ready, then verify with:
   ```bash
   curl -s http://localhost:3001/api/v1/health
   ```

## Step 4: Provide the URL

Once both servers are confirmed running, tell the user the URL to open in their browser. Construct it from the page path extracted in Step 1:

```
http://localhost:<vite-port><page-path>
```

For example, if the HAR was captured on `/projects/abc-123/dashboards/def-456/view`, the URL would be `http://localhost:3002/projects/abc-123/dashboards/def-456/view`.

Note: Vite may pick a port other than 3000 since 3001 is in use. Check the Vite startup output for the actual port.

## Step 5: Debug any rendering errors

If the user reports errors:
1. Check the replay server logs for 404s (missing HAR entries)
2. Check for response format issues (base64 encoding, unexpected MIME types)
3. Fix the replay server script and restart

## Notes

- The replay server is disposable — it's tailored to the specific HAR file and can be deleted after use
- HAR files may contain session cookies and sensitive data — do not commit them
- The frontend will 404 on any navigation away from the captured pages
- To re-capture: Chrome DevTools > Network tab > right-click > "Save all as HAR with content"
