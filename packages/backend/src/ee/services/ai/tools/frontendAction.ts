import {
    toolFrontendActionArgsSchema,
    toolFrontendActionOutputSchema,
} from '@lightdash/common';
import { tool } from 'ai';
import type {
    CreateFrontendToolExecutionFn,
    WaitForFrontendToolResultFn,
} from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';

const DEFAULT_TIMEOUT_MS = 60_000;

type Dependencies = {
    promptUuid: string;
    threadUuid: string;
    createFrontendToolExecution: CreateFrontendToolExecutionFn;
    waitForFrontendToolResult: WaitForFrontendToolResultFn;
};

export const getFrontendAction = ({
    promptUuid,
    threadUuid,
    createFrontendToolExecution,
    waitForFrontendToolResult,
}: Dependencies) =>
    tool({
        description: toolFrontendActionArgsSchema.description,
        inputSchema: toolFrontendActionArgsSchema,
        outputSchema: toolFrontendActionOutputSchema,
        execute: async ({ action, payload }, { toolCallId }) => {
            try {
                await createFrontendToolExecution({
                    promptUuid,
                    threadUuid,
                    toolCallId,
                    toolName: 'frontendAction',
                    action,
                    payload,
                });

                const frontendResult = await waitForFrontendToolResult(
                    toolCallId,
                    DEFAULT_TIMEOUT_MS,
                );

                if (frontendResult.status === 'timeout') {
                    return {
                        result: `Frontend action "${action}" timed out waiting for the web app.`,
                        metadata: { status: 'error' },
                    };
                }

                return {
                    result: frontendResult.result,
                    metadata: {
                        status: frontendResult.status,
                    },
                };
            } catch (error) {
                return {
                    result: toolErrorHandler(
                        error,
                        `Error executing frontend action "${action}".`,
                    ),
                    metadata: { status: 'error' },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
