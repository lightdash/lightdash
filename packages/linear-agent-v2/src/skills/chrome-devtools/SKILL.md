---
name: chrome-devtools
description: Drive a headless Chrome from bash via chrome-devtools-mcp to visually verify frontend changes. Use when you need to load a page, take a screenshot, or inspect the DOM/console of a running app.
---

Launch the MCP server (stdio) with:

```bash
pnpx -y chrome-devtools-mcp@latest --channel dev --isolated
```

It speaks MCP JSON-RPC over stdio — drive it from bash with newline-delimited
JSON on stdin. Handshake first (`initialize` + `notifications/initialized`),
then `tools/call`. One-shot example — navigate and screenshot:

```bash
(printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"bash","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"navigate_page","arguments":{"url":"http://localhost:3000"}}}' \
  '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"take_screenshot","arguments":{"filePath":"/tmp/page.png"}}}' \
  ; sleep 15) | pnpx -y chrome-devtools-mcp@latest --channel dev --isolated
```

Useful tools: `navigate_page`, `take_snapshot` (text DOM outline — prefer over
screenshots for reading content), `take_screenshot`, `evaluate_script`,
`click`, `fill`, `list_console_messages`. Discover the full set with a
`tools/list` request.

Notes:

- Responses come back as JSON-RPC lines on stdout, matched by `id`.
- `--isolated` uses a throwaway profile; each invocation is a fresh browser.
- If Chrome Dev channel isn't installed, drop `--channel dev`.
- If `pnpx` isn't on PATH, use `pnpm dlx` or `npx -y` with the same package
  and flags.
