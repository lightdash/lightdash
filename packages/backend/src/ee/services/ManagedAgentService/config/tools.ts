import { jsonSchema, tool, type ToolSet } from 'ai';
import type { AutopilotToolDefinition } from './agent';

export const AUTOPILOT_SLACK_SUMMARY_TOOL_NAME = 'write_slack_summary';

export type ExecuteAutopilotTool = (
    toolName: string,
    input: Record<string, unknown>,
) => Promise<string>;

type BuildAutopilotToolsArgs = {
    definitions: AutopilotToolDefinition[];
    executeTool: ExecuteAutopilotTool;
    onSlackSummary: (summary: string) => void;
};

const toErrorResult = (error: unknown): string =>
    JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
    });

const buildSlackSummaryTool = (
    definition: AutopilotToolDefinition,
    onSlackSummary: (summary: string) => void,
) =>
    tool({
        description: definition.description,
        inputSchema: jsonSchema<Record<string, unknown>>(
            definition.inputSchema,
        ),
        execute: async (input) => {
            const summary =
                typeof input.summary === 'string' ? input.summary.trim() : '';
            if (!summary) {
                return JSON.stringify({
                    error: 'summary must be a non-empty string',
                });
            }
            onSlackSummary(summary);
            return JSON.stringify({ ok: true, summary_length: summary.length });
        },
    });

// Wraps the Autopilot action tools for the AI SDK loop. Input schemas are the
// same JSON schemas the managed-agent runtime uses, so the model contract does
// not change between runtimes. Handler failures are returned to the model as an
// error result instead of aborting the run.
export const buildAutopilotTools = ({
    definitions,
    executeTool,
    onSlackSummary,
}: BuildAutopilotToolsArgs): ToolSet =>
    Object.fromEntries(
        definitions.map((definition) => {
            if (definition.name === AUTOPILOT_SLACK_SUMMARY_TOOL_NAME) {
                return [
                    definition.name,
                    buildSlackSummaryTool(definition, onSlackSummary),
                ];
            }
            return [
                definition.name,
                tool({
                    description: definition.description,
                    inputSchema: jsonSchema<Record<string, unknown>>(
                        definition.inputSchema,
                    ),
                    execute: async (input) => {
                        try {
                            return await executeTool(definition.name, input);
                        } catch (error) {
                            return toErrorResult(error);
                        }
                    },
                }),
            ];
        }),
    );
