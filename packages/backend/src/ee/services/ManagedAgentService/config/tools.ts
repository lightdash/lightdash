import { createAgentInputSchema } from '@lightdash/common';
import { tool, type ToolSet } from 'ai';
import type { AutopilotToolDefinition } from './agent';

export const AUTOPILOT_SLACK_SUMMARY_TOOL_NAME = 'write_slack_summary';

export type ExecuteAutopilotTool = (
    toolName: string,
    input: Record<string, unknown>,
    abortSignal?: AbortSignal,
) => Promise<string>;

type BuildAutopilotToolsArgs = {
    definitions: AutopilotToolDefinition[];
    executeTool: ExecuteAutopilotTool;
    onSlackSummary: (summary: string) => void;
};

export const buildAutopilotTools = ({
    definitions,
    executeTool,
    onSlackSummary,
}: BuildAutopilotToolsArgs): ToolSet => {
    let pending: Promise<unknown> = Promise.resolve();
    return Object.fromEntries(
        definitions.map((definition) => [
            definition.name,
            tool({
                description: definition.description,
                inputSchema: createAgentInputSchema(definition.inputSchema),
                execute: async (input, { abortSignal }) => {
                    // Count/check/write guards require sequential action execution.
                    const result = pending.then(async () => {
                        abortSignal?.throwIfAborted();
                        if (
                            definition.name ===
                            AUTOPILOT_SLACK_SUMMARY_TOOL_NAME
                        ) {
                            const summary =
                                typeof input.summary === 'string'
                                    ? input.summary.trim()
                                    : '';
                            if (!summary) {
                                return JSON.stringify({
                                    error: 'summary must be a non-empty string',
                                });
                            }
                            onSlackSummary(summary);
                            return JSON.stringify({
                                ok: true,
                                summary_length: summary.length,
                            });
                        }
                        try {
                            return await executeTool(
                                definition.name,
                                input,
                                abortSignal,
                            );
                        } catch (error) {
                            abortSignal?.throwIfAborted();
                            return JSON.stringify({
                                error:
                                    error instanceof Error
                                        ? error.message
                                        : 'Unknown error',
                            });
                        }
                    });
                    // Failed tools must not poison the queue for recovery calls.
                    pending = result.catch(() => undefined);
                    return result;
                },
            }),
        ]),
    );
};
