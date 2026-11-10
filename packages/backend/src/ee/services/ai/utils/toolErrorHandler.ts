import {
    AiAccessRefusedError,
    getAgentPermissionRefusalDetails,
    getErrorMessage,
    SnowflakeTokenError,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import Logger from '../../../../logging/logger';
import {
    getAiAgentSentryContext,
    isAgentRecoverableError,
    isAlreadyReported,
} from '../../../../sentry/aiAgentErrors';
import { serializeData } from './serializeData';
import type { ExecuteToolErrorResult } from './structuredToolResult';

const errorName = (error: unknown): string =>
    error instanceof Error ? error.name : 'UnknownError';

const isPersonalSnowflakeTokenError = (error: unknown): boolean =>
    error instanceof SnowflakeTokenError &&
    error.data.requiresUserReauthentication === true &&
    !error.data.sharedSignIn;

export const toolErrorHandler = (
    error: unknown,
    message: string,
    options: { captureToSentry?: boolean } = {},
) => {
    const captureToSentry =
        options.captureToSentry ??
        (isAlreadyReported(error) ? false : undefined);
    if (captureToSentry === undefined && isAgentRecoverableError(error)) {
        // Expected: the model can fix it, so a warning grouped by throw site rather than an incident
        Sentry.captureException(error, {
            level: 'warning',
            ...getAiAgentSentryContext(),
        });
    } else if (captureToSentry !== false) {
        Sentry.captureException(error);
    } else {
        // Keep the model's failed attempts visible on whatever incident fires
        // later in the same turn, without making each attempt an issue.
        Sentry.addBreadcrumb({
            category: 'ai.tool',
            level: 'warning',
            message: `${errorName(error)}: ${getErrorMessage(error)}`,
        });
        Sentry.getActiveSpan()?.setAttributes({
            'ai.tool.error.name': errorName(error),
            'ai.tool.error.recoverable': true,
        });
    }

    if (isPersonalSnowflakeTokenError(error)) {
        const errorMessage =
            'Your Snowflake sign-in has expired. Reauthenticate with your own Snowflake account, then send your question again. Do not retry the query or ask an admin to reconnect on your behalf.';
        Logger.warn(
            '[AiAgent][Tool Error Handler] Personal Snowflake sign-in requires reauthentication',
        );
        return errorMessage;
    }

    const refusalDetails =
        error instanceof AiAccessRefusedError
            ? getAgentPermissionRefusalDetails(error.refusal)
            : '';
    const errorMessage =
        error instanceof AiAccessRefusedError
            ? `${error.message}${refusalDetails ? `\n\n${refusalDetails}` : ''}${
                  error.refusal.reason.startsWith('agent_')
                      ? '\n\nDo not retry this operation or use another tool to bypass this refusal. Ask the user to resolve the access requirement first.'
                      : ''
              }`
            : `${message}

${serializeData(getErrorMessage(error), 'raw')}

Try again if you believe the error can be resolved.
`;

    Logger.error(`[AiAgent][Tool Error Handler] ${errorMessage}`);

    return errorMessage;
};

/**
 * The complete error output of an agent tool: the model-facing text plus its
 * structured `{ error }` mirror, so every tool path returns `structuredContent`.
 */
export const toolErrorOutput = (
    error: unknown,
    message: string,
    options: { captureToSentry?: boolean } = {},
): ExecuteToolErrorResult => {
    const result = toolErrorHandler(error, message, options);
    return {
        result,
        metadata: {
            status: 'error',
            ...(isPersonalSnowflakeTokenError(error)
                ? { requiresSnowflakeReauthentication: true as const }
                : {}),
            ...(error instanceof AiAccessRefusedError &&
            error.refusal.reason.startsWith('agent_')
                ? { refusal: error.refusal }
                : {}),
        },
        structuredContent: {
            error: result,
            ...(error instanceof AiAccessRefusedError
                ? { refusal: error.refusal }
                : {}),
        },
    };
};
