export const STEP_CAP_REACHED_MESSAGE =
    'The agent reached its maximum number of steps before finishing. Please try asking for fewer things at once, or split your question into smaller parts.';

export class AiAgentStepCapReachedError extends Error {
    readonly stepsCount: number;

    constructor(stepsCount: number) {
        super(STEP_CAP_REACHED_MESSAGE);
        this.name = 'AiAgentStepCapReachedError';
        this.stepsCount = stepsCount;
    }
}

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
    if (error instanceof AiAgentStepCapReachedError) {
        return STEP_CAP_REACHED_MESSAGE;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);

    // Context/token limit errors
    if (
        errorMessage.includes('context_length_exceeded') ||
        errorMessage.includes('input exceeds the context window') ||
        errorMessage.includes('maximum context length') ||
        errorMessage.includes('token limit') ||
        errorMessage.includes('too long') ||
        errorMessage.includes('context window') ||
        errorMessage.match(/\d+\s*tokens?\s*>\s*\d+/i) ||
        errorMessage.match(
            /exceeds?\s*(the\s+)?(model'?s?\s+)?maximum\s+(token|context)/i,
        )
    ) {
        return "This request exceeded the AI model's context limit, usually because the conversation or tool results became too large. Please start a new thread or break the request into smaller steps.";
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
