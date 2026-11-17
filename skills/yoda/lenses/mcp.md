# MCP

## Review

- **Skip when:** a tool outside clients don't get, with the MCP contract snapshot and `mcp-tools-1.0.json` unchanged (AI Agent), or MCP auth and OAuth (Access).
- **Worst case:** AI clients outside the repo (Claude, Cursor, customers' agents) break or quietly misuse a tool.
- **Evidence:** read the tool schema diff and the contract snapshot (`mcpToolContracts.snapshot.test.ts.snap`).
- **additive:** no removed or renamed tool, argument or output field, no enum value removed, and nothing newly required.
  Any of these is Fix unless the old shape still works.
- **snapshot agrees:** the contract snapshot and `mcp-tools-1.0.json` are regenerated and show exactly the intended change.
- **descriptions:** reworded tool/argument descriptions show new behaviour in an outside-client run or eval; in-app runs don't count.
- **validated:** arguments are checked at the edge, and errors come back as tool errors the client can act on, not a crash.
- **output bounded:** what a tool returns has a row or size limit, since the client puts it in a model's context.

## Impact

- **breaking:** removed/renamed tools, arguments or outputs break clients.
- **notable:** new tool/argument or behaviour-changing description.
- **minor:** typo.

## Diff

```ts
type McpDiff = Diff & {
    field?: string;  // argument or output field; `description` after it for a reworded description, alone for the tool's own
};
```

- **Name:** the tool name.
- **Note:** what the model is now told or gets.
- **Granularity:** one diff per tool and field.

```json
{ "lens": "MCP", "change": "modified", "impact": "notable", "name": "query", "field": "duckdb node `sql` description", "note": "write every column alias with `AS`" }
```
