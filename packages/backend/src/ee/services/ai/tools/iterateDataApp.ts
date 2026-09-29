import {
    getErrorMessage,
    iterateDataAppToolDefinition,
    type ToolIterateDataAppOutput,
    type ToolIterateDataAppStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import type { IterateDataAppFn } from '../types/aiAgentDependencies';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorOutput } from '../utils/toolErrorHandler';

type Dependencies = {
    iterateDataApp: IterateDataAppFn;
};

type PendingMetadata = Extract<
    ToolIterateDataAppOutput['metadata'],
    { status: 'pending' }
>;
type ErrorMetadata = Extract<
    ToolIterateDataAppOutput['metadata'],
    { status: 'error' }
>;

const toolDefinition = iterateDataAppToolDefinition.for('agent');

export const getIterateDataApp = ({ iterateDataApp }: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async (
            { appSlug, prompt, dashboardSlug, chartSlugs, themeSlug },
            { toolCallId },
        ): Promise<
            | ExecuteStructuredToolResult<
                  ToolIterateDataAppStructuredContent,
                  PendingMetadata
              >
            | ExecuteToolErrorResult<ErrorMetadata>
        > => {
            try {
                const { appUuid, version } = await iterateDataApp({
                    appSlug,
                    prompt,
                    dashboardSlug,
                    chartSlugs,
                    themeSlug,
                    toolCallId,
                });
                const started = {
                    status: 'pending' as const,
                    appUuid,
                    version,
                };

                return {
                    result: 'Started the data app build. Tell the user it has started and will take a few minutes, then end your turn.',
                    metadata: started,
                    structuredContent: started,
                };
            } catch (error) {
                return {
                    ...toolErrorOutput(
                        error,
                        'Error starting the data app build. No new version was created.',
                    ),
                    metadata: {
                        status: 'error',
                        appUuid: null,
                        reason: 'failed',
                        message: getErrorMessage(error),
                    },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
