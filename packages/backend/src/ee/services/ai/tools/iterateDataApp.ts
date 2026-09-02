import {
    ForbiddenError,
    getErrorMessage,
    iterateDataAppToolDefinition,
    NotFoundError,
    ParameterError,
} from '@lightdash/common';
import { tool } from 'ai';
import type { IterateDataAppFn } from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    iterateDataApp: IterateDataAppFn;
};

const toolDefinition = iterateDataAppToolDefinition.for('agent');

// The agent's mistakes and expected refusals, not incidents: an unknown slug,
// a version already building, or missing manage permission on the app.
const isExpectedIterateError = (error: unknown): boolean =>
    error instanceof NotFoundError ||
    error instanceof ParameterError ||
    error instanceof ForbiddenError;

export const getIterateDataApp = ({ iterateDataApp }: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async (
            { appSlug, prompt, dashboardSlug, chartSlugs },
            { toolCallId },
        ) => {
            try {
                const { appUuid, version } = await iterateDataApp({
                    appSlug,
                    prompt,
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
                        'Error starting the data app build. No new version was created.',
                        { captureToSentry: !isExpectedIterateError(error) },
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
