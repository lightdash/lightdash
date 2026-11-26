# MCP Tool Contract Notes

- Before editing a tool description or MCP prompt text, read `docs/ai-agent/prompt-writing-principles.md`.
- MCP tool names are snake_case.
- Keep tool descriptions, input schemas, output schemas, and prompt text stable unless the MCP-facing contract is intentionally changing.
- Run `pnpm -F backend test src/ee/services/McpService/mcpToolContracts.snapshot.test.ts` before and after shared tool-definition refactors.
- If an MCP tool or prompt contract intentionally changes, update only the affected entry in the backend runtime contract snapshot and mention the contract change in review.
- Separately, run `pnpm generate:mcp-tools-snapshot` and commit `packages/common/src/schemas/json/mcp-tools-1.0.json` whenever the stable/default MCP tool surface changes, including tool membership, metadata, input or output schemas, and imported schemas.
- Do not regenerate the committed tool-surface snapshot solely for a temporary runtime-selected rollout variant. Regenerate it when the variant becomes the default; run `pnpm check:mcp-tools-snapshot` when unsure.

## Where composer rules live

- A rule every `query` pipeline needs goes on the `query` tool description (`MCP_TOOL_QUERY_DESCRIPTION`), under "Plan the pipeline". Budget: 4,096 chars, guarded by "keeps registered MCP tool descriptions within their char budget" in `mcpToolContracts.snapshot.test.ts`.
- Detail only some pipelines need goes in the `composer-querying` skill. Edit `../ai/skills/composerQueryingSkill.ts`, then run `pnpm -F backend generate:composer-querying-skill`.
- Rule text lives once, in `COMPOSER_RULES` (`packages/common/src/ee/AiAgent/schemas/tools/composerQueryRules.ts`), which feeds the agent prompt (`../ai/prompts/systemV2QueryingComposer.ts`), the skill and the `query` description. Edit a shared rule there; write wording only one consumer needs in that consumer.
- Composer server instructions (`buildMcpComposerPrompt` in `../ai/prompts/mcpAnalyst.ts`) carry the skill pointer, the workflow and rules about the server itself: explore choice, the connect link, other skills' pointers.
- A skill a model must read gets a pointer in the first sentence of the description of the tool that needs it; a skill nobody points to goes unread. For `composer-querying` that sentence is `COMPOSER_QUERYING_SKILL_POINTER`, also the instructions' first line.

Done when `mcpToolContracts.snapshot.test.ts` and `../ai/skills/builtInSkills.test.ts` pass, the snapshot changed only in the entries you meant to change, and `composer-querying/SKILL.md` and `mcp-tools-1.0.json` are regenerated.

Why the rules live here, and the alternatives measured: `docs/composer-queries/adr/0010-composer-rules-live-on-the-query-tool-and-a-pointed-to-skill.md`.
Before sizing or moving any MCP text, read `client-limits.md`.
