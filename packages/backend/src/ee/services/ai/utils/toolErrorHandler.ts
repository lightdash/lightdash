import {
    BigqueryTokenError,
    DatabricksTokenError,
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

    const errorMessage = `${message}

${serializeData(getErrorMessage(error), 'raw')}

Try again if you believe the error can be resolved.
`;

    Logger.error(`[AiAgent][Tool Error Handler] ${errorMessage}`);

    return errorMessage;
};
