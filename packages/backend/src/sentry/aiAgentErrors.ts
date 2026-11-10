import {
    BigqueryTokenError,
    DatabricksTokenError,
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
import { getAiAgentLogContext } from '../logging/aiAgentLogContext';
import { AI_AGENT_SENTRY_TAG } from './ignoredErrors';

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

// As in the HTTP error handler: a LightdashError below 500 is one the model can fix
// on its next attempt, so it is feedback, not an incident
export const isAgentRecoverableError = (error: unknown): boolean =>
    error instanceof LightdashError &&
    error.statusCode < 500 &&
    !infrastructureErrors.some((errorClass) => error instanceof errorClass);

const alreadyReported = new WeakSet<object>();

/** Marks an error whose underlying failure is already in Sentry, so it is not sent again. */
export const markAlreadyReported = <T extends object>(error: T): T => {
    alreadyReported.add(error);
    return error;
};

export const isAlreadyReported = (error: unknown): boolean =>
    typeof error === 'object' && error !== null && alreadyReported.has(error);

/** Sentry tags and context for an AI agent event, with the turn's ids when inside one. */
export const getAiAgentSentryContext = (): {
    tags: Record<string, string>;
    contexts: Record<string, Record<string, string | null>>;
} => {
    const context = getAiAgentLogContext();
    if (context === null)
        return { tags: { [AI_AGENT_SENTRY_TAG]: 'true' }, contexts: {} };
    return {
        tags: {
            [AI_AGENT_SENTRY_TAG]: 'true',
            ...(context.toolName === null ? {} : { tool: context.toolName }),
            threadUuid: context.threadUuid,
            promptUuid: context.promptUuid,
            agentUuid: context.agentUuid,
            organizationUuid: context.organizationUuid,
            model: context.model,
            serverVersion: context.serverVersion,
        },
        contexts: {
            aiAgent: {
                threadUrl: context.threadUrl,
                projectUuid: context.projectUuid,
                toolCallId: context.toolCallId,
            },
        },
    };
};
