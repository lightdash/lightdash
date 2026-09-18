# AI Agent Tool Contract Notes

- Agent tool names are camelCase.
- Keep descriptions, input schemas, and output schemas stable unless the LLM-facing contract is intentionally changing.
- Run `pnpm -F backend test src/ee/services/ai/tools/toolContracts.snapshot.test.ts` before and after shared tool-definition refactors.
- If an agent tool contract intentionally changes, update only the AI agent snapshot entry and mention the contract change in review.
- `searchTools` and `runCode` are AI SDK tools (`toolSearch()` and `@ai-sdk/code-mode`), wired in `agents/agentToolRouting.ts`. Their `@lightdash/common` definitions are mirrors that only let calls persist and render; the contract snapshot test checks the mirrors against the SDK input schemas.
