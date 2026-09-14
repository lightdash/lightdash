# MCP Tool Contract Notes

- MCP tool names are snake_case.
- Keep tool descriptions, input schemas, output schemas, and prompt text stable unless the MCP-facing contract is intentionally changing.
- Run `pnpm -F backend test src/ee/services/McpService/mcpToolContracts.snapshot.test.ts` before and after shared tool-definition refactors.
- If an MCP tool or prompt contract intentionally changes, update only the affected entry in the backend runtime contract snapshot and mention the contract change in review.
- Separately, run `pnpm generate:mcp-tools-snapshot` and commit `packages/common/src/schemas/json/mcp-tools-1.0.json` whenever the stable/default MCP tool surface changes, including tool membership, metadata, input or output schemas, and imported schemas.
- Do not regenerate the committed tool-surface snapshot solely for a temporary runtime-selected rollout variant. Regenerate it when the variant becomes the default; run `pnpm check:mcp-tools-snapshot` when unsure.
