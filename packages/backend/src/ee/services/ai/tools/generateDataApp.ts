import {
    generateDataAppToolDefinition,
    getErrorMessage,
    NotFoundError,
} from '@lightdash/common';
import { tool } from 'ai';
import type { GenerateDataAppFn } from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    generateDataApp: GenerateDataAppFn;
};

const toolDefinition = generateDataAppToolDefinition.for('agent');

export const getGenerateDataApp = ({ generateDataApp }: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async (
            { prompt, template, dashboardSlug, chartSlugs },
            { toolCallId },
        ) => {
            try {
                const { appUuid, version } = await generateDataApp({
                    prompt,
                    template,
                    dashboardSlug,
                    chartSlugs,
                    toolCallId,
                });

                return {
                    result: 'Started the data app build. Tell the user it has started and will take a few minutes, then end your turn.',
                    metadata: {
                        status: 'pending' as const,
                        appUuid,
                        version,
                    },
                };
            } catch (error) {
                return {
                    result: toolErrorHandler(
                        error,
                        'Error starting the data app build. No app was created.',
                        // An unknown slug is the agent's mistake, not an incident.
                        { captureToSentry: !(error instanceof NotFoundError) },
                    ),
                    metadata: {
                        status: 'error' as const,
                        appUuid: null,
                        reason: 'failed' as const,
                        message: getErrorMessage(error),
                    },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
