# MCP Tool Contract Notes

- Before editing a tool description or MCP prompt text, read `docs/ai-agent/prompt-writing-principles.md`.
- MCP tool names are snake_case.
- Keep tool descriptions, input schemas, output schemas, and prompt text stable unless the MCP-facing contract is intentionally changing.
- Run `pnpm -F backend test src/ee/services/McpService/mcpToolContracts.snapshot.test.ts` before and after shared tool-definition refactors.
- If an MCP tool or prompt contract intentionally changes, update only the affected entry in the backend runtime contract snapshot and mention the contract change in review.
- Separately, run `pnpm generate:mcp-tools-snapshot` and commit `packages/common/src/schemas/json/mcp-tools-1.0.json` whenever the stable/default MCP tool surface changes, including tool membership, metadata, input or output schemas, and imported schemas.
- Do not regenerate the committed tool-surface snapshot solely for a temporary runtime-selected rollout variant. Regenerate it when the variant becomes the default; run `pnpm check:mcp-tools-snapshot` when unsure.

## Composer instructions mirror the agent prompt

The composer server instructions (`buildMcpComposerPrompt` in `../ai/prompts/mcpAnalyst.ts`) copy the agent's composer rules from `../ai/prompts/systemV2QueryingComposer.ts` ("Answering data questions" and "Field usage"). Mirror every rule edit in the other file. MCP leaves out on purpose:

- visualize, chart shaping, figure citations and chart type in follow-ups: MCP has no charting.
- the python node's typing and stdout contract, and why a merge keeps governed metadata: they belong on the `query` tool's description and `code` field.
- "use only fieldIds returned by discovery": workflow step 2 carries it.

MCP words three rules its own way: one semanticLayer node gets every field the answer needs from its explore; the sql rule folds in what to do when no table holds the data; the joined-table rule keeps the classic MCP wording.

Every variant stays within `MCP_CLIENT_TEXT_MAX_CHARS` (4,096, the Claude Code cut). Rules run most important first, since clients with a smaller cut lose the tail. Over budget, trim the workflow list before a rule.
