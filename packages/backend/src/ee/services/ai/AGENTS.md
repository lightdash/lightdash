# AI agent

- Before editing system prompt text, tool descriptions or built-in skills, read `docs/ai-agent/prompt-writing-principles.md`: where each sentence belongs, the twelve writing rules, and how to regenerate the fixtures and snapshots.
- Slack chart images (`utils/getPivotedResults.ts`, `utils/renderEcharts.ts`): pipeline and the render endpoint for reproducing them without Slack are in `packages/common/src/ee/AiAgent/chartConfig/slack/AGENTS.md`.
- Editing a composer rule in `prompts/systemV2QueryingComposer.ts`: edit its text in `COMPOSER_RULES` (`packages/common/src/ee/AiAgent/schemas/tools/composerQueryRules.ts`), which also feeds the MCP `query` description and `composer-querying` skill; then follow "Where composer rules live" in `../McpService/AGENTS.md`.
