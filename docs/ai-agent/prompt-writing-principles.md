# Writing the agent prompt and tool descriptions

Rules for every sentence the AI agent reads: the system prompt sections (`packages/backend/src/ee/services/ai/prompts/`), the tool descriptions (`packages/common/src/ee/AiAgent/schemas/tools/`) and the built-in skills (`packages/backend/src/ee/services/ai/skills/builtInSkills/`). Drawn from the Anthropic and OpenAI prompting guides for the Claude 5 and GPT-5.5/5.6 families and from the writing-for-agents method. Terms: `docs/ai-agent/CONTEXT.md`.

## Where a sentence lives

- **Tool description**: how to call one tool, its parameters, its result shape, its own errors. It names another tool only as the source of an input ("chartUuid from findContent") or as the alternative for a case it does not handle ("for explore-backed tables use grepFields"), and only when that tool loads wherever this one does.
- **System prompt**: the order between tools and the policy that no single tool owns. Sequences across tools ("save with createContent, then schedule") and conditions on turn or conversation state ("a chart from an earlier turn") live here, in the base they apply to.
- **Skill**: material only some turns need (a formula reference, a repository workflow). The prompt keeps one pointer sentence that names the trigger.
- **Conditional section**: text that describes something present in the request (documents, project context) renders only when that thing is present, beside it.

Test for each line: inline what every branch needs; push behind a pointer what only some branches reach.

## The twelve rules

1. **One meaning, one place, the place it is read.** State each instruction once. Both vendors measured minimal prompts scoring higher. Duplication inflates a rule's rank and splits its maintenance.
2. **Name the target behaviour; prohibit only invariants, and pair each prohibition with the positive.** "Build the query from the columns describeWarehouseTable returns" beats "never SELECT *". A ban drags the banned behaviour into context.
3. **Emphasis budget.** Capitals, bold and MUST only for server-enforced or safety invariants. Current models over-trigger on "CRITICAL: you MUST". A stated fact ("the server rejects any SQL reading information_schema") carries its own weight.
4. **Give the reason once and let the model generalize.** One good reason ("every runSql call costs the user an approval click") replaces its restatements.
5. **Scope every rule.** Both families read literally; a blanket "always" fires where it should not. Write the condition: "semantic layer when an explore covers the question, raw SQL for the four named cases".
6. **Decision rules over process scripts.** Keep order where order matters; drop step-by-step where the tool descriptions already define the path.
7. **No-op hunt with a receipt.** A sentence the model already obeys by default pays load to say nothing ("use meaningful aliases"). Delete the whole sentence, list it in the PR so the eval run can veto it.
8. **Hunt contradictions.** Conflicting rules destabilize more than missing ones. Each cluster collapses into one conditional rule.
9. **One word per concept, reused everywhere.** A leading word anchors behaviour in one token: "discover" and "re-discover" for finding fields, in prompt, descriptions and glossary alike.
10. **Provider-neutral text.** Claude and GPT both run this prompt. No "think step by step", no parallel-call blocks, no effort prompting.
11. **Structure stays.** Headings and section order change only in a structural PR; dynamic context stays last for caching. Markdown headings are fine for both vendors.
12. **Every change is a rewrite with a receipt.** Meaning is preserved unless the deletion list says otherwise. The PR body carries before and after per paragraph with the rule applied; the eval set decides the merge.

## Pruning checks

- **Cache or environment?** A description that restates what the tool result or schema already shows is a cache. Keep the unwritten convention, the reason, the gotcha; drop the restated lookup.
- **Sediment.** Paragraphs that exist because one failure once happened. Halve them or move them behind the eval before deleting.
- **Co-location.** A concept's definition, rules and caveats sit under one heading, not across the prompt and three descriptions.
- **Pointer wording.** A skill or section pointer states what the material is and the one trigger per branch, front-loaded.

## Running a pass

- Work one unit at a time: an add-on or base, its section and its tool descriptions together, so a rule gets exactly one home.
- Prompt fixtures (`prompts/__fixtures__/*.txt`) are byte-compared and regenerate with `UPDATE_PROMPT_FIXTURES=1`. Loadout snapshots (`loadout/__snapshots__/**/*.prompt.txt`) and the contract snapshot (`tools/__snapshots__/agentToolContracts.snapshot.test.ts.snap`) regenerate with `-u`. Shared descriptions also feed the MCP snapshot: `pnpm generate:mcp-tools-snapshot`.
- Count words before and after (`wc -w` on the classic fixtures) and report both.
