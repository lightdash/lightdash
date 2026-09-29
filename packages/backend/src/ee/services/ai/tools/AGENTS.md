# AI Agent Tool Contract Notes

- Agent tool names are camelCase.
- Keep descriptions, input schemas, and output schemas stable unless the LLM-facing contract is intentionally changing.
- Run `pnpm -F backend test src/ee/services/ai/tools/toolContracts.snapshot.test.ts` before and after shared tool-definition refactors.
- If an agent tool contract intentionally changes, update only the AI agent snapshot entry and mention the contract change in review.
- Every agent tool output is `{ result, metadata, structuredContent }` (`structuredToolOutputSchema` in `packages/common/src/ee/AiAgent/schemas/outputMetadata.ts`): `result` is the text the model reads, `structuredContent` is the same answer as typed JSON (the tool's own shape on success, `{ error }` on failure via `toolErrorOutput`). Derive both from one computation, and assert `tool<Name>OutputSchema.safeParse(output)` on a success and an error path in the tool's tests.
