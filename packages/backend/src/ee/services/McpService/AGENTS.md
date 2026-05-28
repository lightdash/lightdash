# MCP Tool Contract Notes

- MCP tool names are snake_case.
- Keep tool descriptions, input schemas, output schemas, and prompt text stable unless the MCP-facing contract is intentionally changing.
- Run `pnpm -F backend test src/ee/services/ai/tools/toolContracts.snapshot.test.ts` before and after shared tool-definition refactors.
- If an MCP tool or prompt contract intentionally changes, update only the MCP snapshot entry and mention the contract change in review.
