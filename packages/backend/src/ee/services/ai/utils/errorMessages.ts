import { APICallError, RetryError } from 'ai';
import { get, isPlainObject } from 'lodash';
import type { AiKeyManagement } from '../../../../analytics/aiUsage';
import { McpAuthorizationRequiredError } from '../AiAgentMcpRuntimeClient';

export const STEP_CAP_REACHED_MESSAGE =
    'The agent reached its work limit before it could write a response. Try asking for fewer things at once, or split your request into smaller parts.';

export class AiAgentStepCapReachedError extends Error {
    readonly stepsCount: number;

    constructor(stepsCount: number) {
        super(STEP_CAP_REACHED_MESSAGE);
        this.name = 'AiAgentStepCapReachedError';
        this.stepsCount = stepsCount;
    }
}

export const EMPTY_RESPONSE_MESSAGE =
    'The agent finished without writing a response. Please try again — if it keeps happening, rephrase the question or start a new thread.';

export const PROVIDER_BILLING_MESSAGE =
    'The configured AI provider account has a billing or credit issue. Check its billing settings or add credits, then try again.';

const PROVIDER_BILLING_ERROR_CODES = new Set([
    'billing_error',
    'insufficient_credit',
    'insufficient_credits',
    'insufficient_quota',
    'payment_required',
]);

const getApiCallError = (error: unknown): APICallError | undefined => {
    if (APICallError.isInstance(error)) return error;
    if (
        RetryError.isInstance(error) &&
        APICallError.isInstance(error.lastError)
    ) {
        return error.lastError;
    }
    return undefined;
};

const isProviderBillingError = (error: unknown): boolean => {
    const apiCallError = getApiCallError(error);
    if (!apiCallError) return false;
    if (apiCallError.statusCode === 402) return true;

    const data = isPlainObject(apiCallError.data)
        ? apiCallError.data
        : undefined;
    return [
        get(data, 'type'),
        get(data, 'code'),
        get(data, 'error.type'),
        get(data, 'error.code'),
    ].some(
        (code) =>
            typeof code === 'string' && PROVIDER_BILLING_ERROR_CODES.has(code),
    );
};

// A finished prompt must always carry either a response or an error message.
// This error backs that invariant: the model stopped (under the step cap)
// without producing any text, which would otherwise persist as a blank chat
// bubble with no explanation.
export class AiAgentEmptyResponseError extends Error {
    readonly finishReason: string;

    readonly stepsCount: number;

    constructor(finishReason: string, stepsCount: number) {
        super(EMPTY_RESPONSE_MESSAGE);
        this.name = 'AiAgentEmptyResponseError';
        this.finishReason = finishReason;
        this.stepsCount = stepsCount;
    }
}

/**
 * Converts technical error messages into user-friendly messages for AI agent errors.
 *
 * @param error - The error object or message
 * @param defaultMessage - Optional default message if no specific pattern matches
 * @param keyManagement - Whether the request uses a Lightdash-managed or self-managed key
 * @returns A user-friendly error message
 */
export const getUserFacingErrorMessage = (
    error: unknown,
    defaultMessage: string = 'Something went wrong while processing your request. Please try again.',
    keyManagement?: AiKeyManagement,
): string => {
    if (error instanceof AiAgentStepCapReachedError) {
        return STEP_CAP_REACHED_MESSAGE;
    }

    if (error instanceof AiAgentEmptyResponseError) {
        return EMPTY_RESPONSE_MESSAGE;
    }

    if (error instanceof McpAuthorizationRequiredError) {
        return error.message;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes('MCP HTTP Transport Error')) {
        if (
            errorMessage.includes('HTTP 401') ||
            errorMessage.includes('Unauthorized')
        ) {
            return 'The MCP server rejected the saved credentials. Check the MCP server authentication settings, then try again.';
        }

        if (
            errorMessage.includes('HTTP 403') ||
            errorMessage.includes('Forbidden')
        ) {
            return 'The MCP server refused access. Check that the connected account has permission to use this MCP server.';
        }

        return 'We could not connect to the MCP server. Check that it is available and try again.';
    }

    if (keyManagement === 'self-managed' && isProviderBillingError(error)) {
        return PROVIDER_BILLING_MESSAGE;
    }

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
