/**
 * Converts technical error messages into user-friendly messages for AI agent errors.
 *
 * @param error - The error object or message
 * @param defaultMessage - Optional default message if no specific pattern matches
 * @returns A user-friendly error message
 */
export const getUserFacingErrorMessage = (
    error: unknown,
    defaultMessage: string = 'Something went wrong while processing your request. Please try again.',
): string => {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Context/token limit errors
    if (
        errorMessage.includes('too long') ||
        errorMessage.includes('maximum') ||
        errorMessage.match(/\d+\s*tokens?\s*>\s*\d+/i)
    ) {
        return 'This conversation has become too long to process. Please start a new thread to continue.';
    }

    // Rate limiting / quota errors
    if (
        errorMessage.includes('rate limit') ||
        errorMessage.includes('quota') ||
        errorMessage.includes('throttl')
    ) {
        return 'The service is experiencing high demand. Please try again in a few moments.';
    }

    // Timeout errors
    if (
        errorMessage.includes('timeout') ||
        errorMessage.includes('timed out')
    ) {
        return 'This request took too long to process. Try breaking it into smaller questions or start a new thread.';
    }

    // Default fallback
    return defaultMessage;
};
