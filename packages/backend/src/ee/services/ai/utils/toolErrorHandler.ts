import {
    AiAccessRefusedError,
    BigqueryTokenError,
    DatabricksTokenError,
    getAgentPermissionRefusalDetails,
    getErrorMessage,
    GoogleChatError,
    LightdashError,
    MissingWarehouseCredentialsError,
    MsTeamsError,
    RedshiftIamTokenError,
    SlackError,
    SlackFileUploadError,
    SnowflakeTokenError,
    SshTunnelError,
    UnexpectedGoogleSheetsError,
    WarehouseConnectionError,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import Logger from '../../../../logging/logger';
import { serializeData } from './serializeData';
import type { ExecuteToolErrorResult } from './structuredToolResult';

// Reported as 4xx to API callers, but nothing the model can fix by rephrasing
// its request: the warehouse or an integration is down or misconfigured.
const infrastructureErrors = [
    WarehouseConnectionError,
    MissingWarehouseCredentialsError,
    SshTunnelError,
    SnowflakeTokenError,
    DatabricksTokenError,
    BigqueryTokenError,
    RedshiftIamTokenError,
    SlackError,
    SlackFileUploadError,
    MsTeamsError,
    GoogleChatError,
    UnexpectedGoogleSheetsError,
];

// Mirrors the HTTP error handler: a LightdashError below 500 is a request the
// caller can fix (here, the model on its next attempt), so it is agent feedback
// rather than an incident. Anything else is unexpected and should page.
export const isAgentRecoverableError = (error: unknown): boolean =>
    error instanceof LightdashError &&
    error.statusCode < 500 &&
    !infrastructureErrors.some((errorClass) => error instanceof errorClass);

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
        options.captureToSentry ?? !isAgentRecoverableError(error);
    if (captureToSentry) {
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
        Logger.error(`[AiAgent][Tool Error Handler] ${errorMessage}`);
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
