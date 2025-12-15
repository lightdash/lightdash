/**
 * Regex to detect Slack IDs: C (public channel), G (private channel), U/W (user/DM)
 * @example
 * const isSlackId = SLACK_ID_REGEX.test('C1234567890');
 * const isSlackId = SLACK_ID_REGEX.test('G1234567890');
 * const isSlackId = SLACK_ID_REGEX.test('U1234567890');
 * const isSlackId = SLACK_ID_REGEX.test('W1234567890');
 */
export const SLACK_ID_REGEX = /^[CGUW][A-Z0-9]{8,}$/i;

/**
 * Slack error codes that indicate the installation is broken and won't be fixed by retrying.
 * These are expected for orgs with invalid/revoked tokens - we handle them gracefully
 * without spamming Sentry.
 */
export const UNRECOVERABLE_SLACK_ERRORS = [
    'account_inactive', // Bot/app was deactivated
    'invalid_auth', // Invalid authentication
    'missing_scope', // Missing required OAuth scope
] as const;

/**
 * Extracts the Slack error code from an error object.
 * Slack API errors have the format: { data: { error: 'error_code' } }
 */
export const getSlackErrorCode = (error: unknown): string | undefined => {
    if (
        error &&
        typeof error === 'object' &&
        'data' in error &&
        error.data &&
        typeof error.data === 'object' &&
        'error' in error.data
    ) {
        return (error.data as { error: string }).error;
    }
    return undefined;
};

/**
 * Checks if a Slack error is unrecoverable (installation is broken).
 */
export const isUnrecoverableSlackError = (error: unknown): boolean => {
    const errorCode = getSlackErrorCode(error);
    return (
        errorCode !== undefined &&
        UNRECOVERABLE_SLACK_ERRORS.includes(
            errorCode as typeof UNRECOVERABLE_SLACK_ERRORS[number],
        )
    );
};

/**
 * Checks if a Slack error is a rate limit error.
 * These errors have a special code from the @slack/web-api package.
 */
export const isSlackRateLimitedError = (error: unknown): boolean =>
    error instanceof Error &&
    'code' in error &&
    error.code === 'slack_webapi_rate_limited_error';
