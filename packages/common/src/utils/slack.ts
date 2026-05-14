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
    'channel_not_found', // Channel doesn't exist
    'not_in_channel', // Bot/app isn't in the channel
    'is_archived', // Channel has been archived
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
            errorCode as (typeof UNRECOVERABLE_SLACK_ERRORS)[number],
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

/**
 * User-facing translations for common Slack API error codes. Surfaced in
 * scheduler logs so the delivery recipient gets an actionable explanation
 * instead of a raw API code. The raw code is also recorded as
 * `details.slackErrorCode` for debugging.
 */
export const SLACK_USER_FACING_ERROR_MESSAGES: Record<string, string> = {
    invalid_blocks:
        "Slack rejected this message because it exceeds Slack's size or formatting limits (e.g. dashboard has too many charts, or very long names/descriptions). Please reach out to support if the issue persists.",
    channel_not_found:
        'The Slack channel for this delivery no longer exists. Edit this delivery to choose another channel.',
    not_in_channel:
        "The Lightdash Slack app isn't a member of this channel. Invite the app to the channel or choose a different one.",
    is_archived:
        'This Slack channel has been archived. Edit this delivery to choose another channel.',
    account_inactive:
        'The Lightdash Slack app has been deactivated for your workspace. Ask your admin to reconnect Slack in organization settings, or contact support.',
    invalid_auth:
        'Slack authentication is invalid for your workspace. Ask your admin to reconnect Slack in organization settings, or contact support.',
    missing_scope:
        'The Lightdash Slack app is missing required permissions. Ask your admin to reconnect Slack to grant the new scopes, or contact support.',
};

/**
 * Translates a Slack error into an actionable, user-facing message.
 * Returns null when no translation applies — callers should fall back to their
 * default error message in that case.
 */
export const translateSlackError = (
    error: unknown,
): { error: string; slackErrorCode: string } | null => {
    const slackErrorCode = getSlackErrorCode(error);
    if (slackErrorCode && slackErrorCode in SLACK_USER_FACING_ERROR_MESSAGES) {
        return {
            error: SLACK_USER_FACING_ERROR_MESSAGES[slackErrorCode],
            slackErrorCode,
        };
    }
    return null;
};
