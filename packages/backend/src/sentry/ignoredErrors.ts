import type { ErrorEvent } from '@sentry/node';

export const IGNORE_ERRORS = [
    'WarehouseConnectionError',
    'WarehouseQueryError',
    'WarehouseQueryTimeoutError',
    'FieldReferenceError',
    'NotEnoughResults',
    'CompileError',
    'NotFoundError',
    'ForbiddenError',
    'TokenError',
    'AuthorizationError',
    'SshTunnelError',
    'ReadFileError',
    'AiAgentValidatorError',
    'UserInfoError', // Google oauth2 error when using invalid credentials
    // Invalid user-supplied parameter, surfaced to the user; not a server bug
    'ParameterError',
    // Overdue deprecated routes fire once per request — keep GCP logs, drop Sentry.
    'DeprecatedRouteError',
];

/** Tags an AI agent warning: expected agent errors are the signal, so IGNORE_ERRORS keeps them. */
export const AI_AGENT_SENTRY_TAG = 'aiAgent';

// Mirrors Sentry's getPossibleEventMessages: the message, then the last (top) exception
const eventMessages = (event: ErrorEvent): string[] => {
    const top = event.exception?.values?.at(-1);
    return [
        ...(event.message ? [event.message] : []),
        ...(top?.value ? [top.value] : []),
        ...(top?.value && top.type ? [`${top.type}: ${top.value}`] : []),
    ];
};

/** IGNORE_ERRORS as Sentry's ignoreErrors applies it (substring match), except AI agent warnings. */
export const dropIgnoredErrors = (event: ErrorEvent): ErrorEvent | null => {
    if (
        event.level === 'warning' &&
        event.tags?.[AI_AGENT_SENTRY_TAG] !== undefined
    )
        return event;
    return eventMessages(event).some((message) =>
        IGNORE_ERRORS.some((pattern) => message.includes(pattern)),
    )
        ? null
        : event;
};
