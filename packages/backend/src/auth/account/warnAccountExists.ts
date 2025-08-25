/**
 * Common util for warning about an account already being authenticated.
 * Centralizes messages to enable creating metrics for this case.
 */
export const buildAccountExistsWarning = (message: string) =>
    `${message} Account is already authenticated`;
