import {
    generateDataAppToolDefinition,
    getErrorMessage,
} from '@lightdash/common';
import { tool } from 'ai';
import type { GenerateDataAppFn } from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorOutput } from '../utils/toolErrorHandler';

type Dependencies = {
    generateDataApp: GenerateDataAppFn;
};

const toolDefinition = generateDataAppToolDefinition.for('agent');

export const getGenerateDataApp = ({ generateDataApp }: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async (
            { prompt, template, dashboardSlug, chartSlugs, themeSlug },
            { toolCallId },
        ) => {
            try {
                const { appUuid, version } = await generateDataApp({
                    prompt,
                    template,
                    dashboardSlug,
                    chartSlugs,
                    themeSlug,
                    toolCallId,
                });
                const pendingBuild = {
                    status: 'pending' as const,
                    appUuid,
                    version,
                };

                return {
                    result: 'Started the data app build. Tell the user it has started and will take a few minutes, then end your turn.',
                    metadata: pendingBuild,
                    structuredContent: pendingBuild,
                };
            } catch (error) {
                const { result, structuredContent } = toolErrorOutput(
                    error,
                    'Error starting the data app build. No app was created.',
                );
                return {
                    result,
                    metadata: {
                        status: 'error' as const,
                        appUuid: null,
                        reason: 'failed' as const,
                        message: getErrorMessage(error),
                    },
                    structuredContent,
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
