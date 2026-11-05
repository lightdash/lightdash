# AI Agent Tool Contract Notes

- Before editing a tool description, read `docs/ai-agent/prompt-writing-principles.md`.
- Agent tool names are camelCase.
- A tool that does something a role controls must also be gated on that permission in the loadout, not only checked when it runs. See `../loadout/AGENTS.md`, "Adding a tool".
- Keep descriptions, input schemas, and output schemas stable unless the LLM-facing contract is intentionally changing.
- A tool-definition change can trip each of these snapshots; run them before and after:
  - Agent tool contracts: `pnpm -F backend test src/ee/services/ai/tools/agentToolContracts.snapshot.test.ts`
  - MCP tool contracts: `pnpm -F backend test src/ee/services/McpService/mcpToolContracts.snapshot.test.ts`
  - Committed MCP snapshot (`packages/common/src/schemas/json/mcp-tools-1.0.json`): `pnpm check:mcp-tools-snapshot`; regenerate with `pnpm generate:mcp-tools-snapshot`
  - Loadout prompt snapshots: `pnpm -F backend test src/ee/services/ai/loadout/loadout.test.ts`
  - System prompt fixtures (`prompts/__fixtures__/*.txt`): `pnpm -F backend test src/ee/services/ai/prompts/systemV2.test.ts`; regenerate with `UPDATE_PROMPT_FIXTURES=1`
- If a contract intentionally changes, update only the affected snapshot entries (`-u`, or the noted regenerate command) and mention the contract change in review.
- Every agent tool output is `{ result, metadata, structuredContent }` (`structuredToolOutputSchema` in `packages/common/src/ee/AiAgent/schemas/outputMetadata.ts`): `result` is the text the model reads, `structuredContent` is the same answer as typed JSON (the tool's own shape on success, `{ error }` on failure via `toolErrorOutput`). Derive both from one computation, and assert `tool<Name>OutputSchema.safeParse(output)` on a success and an error path in the tool's tests.
