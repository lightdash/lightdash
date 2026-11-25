# AI agent

- Before editing system prompt text, tool descriptions or built-in skills, read `docs/ai-agent/prompt-writing-principles.md`: where each sentence belongs, the twelve writing rules, and how to regenerate the fixtures and snapshots.
- Slack chart images (`utils/getPivotedResults.ts`, `utils/renderEcharts.ts`): pipeline and the render endpoint for reproducing them without Slack are in `packages/common/src/ee/AiAgent/chartConfig/slack/AGENTS.md`.
- Composer rules in `prompts/systemV2QueryingComposer.ts` are copied into the MCP composer instructions: mirror an edit there, per `../McpService/AGENTS.md`.
