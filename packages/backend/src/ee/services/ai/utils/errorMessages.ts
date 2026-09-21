import { APICallError, RetryError } from 'ai';
import { get, isPlainObject } from 'lodash';
import type { AiKeyManagement } from '../../../../analytics/aiUsage';
import type { AiDecisionClient } from '../decisions/AiDecisionClient';
import {
    classifyUnknownError,
    type ErrorCategory,
    type ErrorDomain,
} from '../decisions/errorClassification';
import {
    getKnownMcpErrorMessage,
    getLegacyMcpErrorMessage,
    isMcpError,
    MCP_CONNECTION_MESSAGE,
    MCP_PERMISSION_MESSAGE,
    MCP_TIMEOUT_MESSAGE,
    McpAuthorizationRequiredError,
    McpRuntimeError,
} from './mcpErrors';

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

// Anthropic reports an exhausted credit balance as a 400 invalid_request_error
// ("Your credit balance is too low... go to Plans & Billing..."), not the
// documented 402 billing_error.
const PROVIDER_BILLING_MESSAGE_PATTERN =
    /credit balance is too low|plans & billing/i;

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
    if (PROVIDER_BILLING_MESSAGE_PATTERN.test(apiCallError.message)) {
        return true;
    }

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
 * @param keyManagement - Whether the request uses a Lightdash-managed or self-managed key
 * @returns A user-friendly error message
 */
export const getKnownUserFacingErrorMessage = (
    error: unknown,
    keyManagement?: AiKeyManagement,
    structuredErrors = true,
): string | undefined => {
    if (error instanceof AiAgentStepCapReachedError) {
        return STEP_CAP_REACHED_MESSAGE;
    }

    if (error instanceof AiAgentEmptyResponseError) {
        return EMPTY_RESPONSE_MESSAGE;
    }

    if (structuredErrors && isMcpError(error))
        return getKnownMcpErrorMessage(error);
    if (error instanceof McpAuthorizationRequiredError) return error.message;
    if (error instanceof McpRuntimeError) return MCP_CONNECTION_MESSAGE;
    const legacyMessage =
        error instanceof Error ? error.message : String(error);
    if (!structuredErrors && legacyMessage.includes('MCP HTTP Transport Error'))
        return getLegacyMcpErrorMessage(new Error(legacyMessage));

    const apiCallError = structuredErrors ? getApiCallError(error) : undefined;
    const errorMessage =
        apiCallError?.message ??
        (error instanceof Error ? error.message : String(error));

    if (keyManagement === 'self-managed' && isProviderBillingError(error)) {
        return PROVIDER_BILLING_MESSAGE;
    }

    if (apiCallError?.statusCode === 401 || apiCallError?.statusCode === 403) {
        return keyManagement === 'self-managed'
            ? 'The configured AI provider rejected this request. Check its credentials and model permissions, then try again.'
            : 'The AI provider could not accept this request. Please try again later.';
    }
    if (apiCallError?.statusCode === 429 && !isProviderBillingError(error))
        return 'The service is experiencing high demand. Please try again in a few moments.';

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
    return undefined;
};

const DEFAULT_ERROR_MESSAGE =
    'Something went wrong while processing your request. Please try again.';

export const getUserFacingErrorMessage = (
    error: unknown,
    defaultMessage: string = DEFAULT_ERROR_MESSAGE,
    keyManagement?: AiKeyManagement,
): string =>
    getKnownUserFacingErrorMessage(error, keyManagement, false) ??
    defaultMessage;

const classifiedErrorMessage = (
    category: ErrorCategory | null,
    domain: ErrorDomain,
    keyManagement?: AiKeyManagement,
): string | undefined => {
    if (domain === 'mcp') {
        switch (category) {
            case 'permissions':
                return MCP_PERMISSION_MESSAGE;
            case 'timeout':
                return MCP_TIMEOUT_MESSAGE;
            case 'connection':
                return MCP_CONNECTION_MESSAGE;
            case 'rate':
                return 'The MCP server is receiving too many requests. Please try again in a few moments.';
            case 'query':
                return 'The MCP server could not process the tool input. Check the requested fields and parameters, then try again.';
            default:
                return undefined;
        }
    }
    switch (category) {
        case 'context':
            return "This request exceeded the AI model's context limit, usually because the conversation or tool results became too large. Please start a new thread or break the request into smaller steps.";
        case 'rate':
            return 'The service is experiencing high demand. Please try again in a few moments.';
        case 'timeout':
            return 'This request took too long to process. Try breaking it into smaller questions or start a new thread.';
        case 'permissions':
            return 'This request could not access a required resource. Check your permissions and the connected account’s credentials, then try again.';
        case 'connection':
            return 'A service needed for this response is unavailable. Please try again in a few moments.';
        case 'billing':
            return keyManagement === 'self-managed'
                ? PROVIDER_BILLING_MESSAGE
                : undefined;
        default:
            return undefined;
    }
};

// One resolver per turn/setup: concurrent error handlers share a decision, but
// no error text or classification is cached across requests. Known errors and
// disabled decisions remain synchronous apart from the returned Promise.
export const createUserFacingErrorResolver = ({
    decisions,
    keyManagement,
    domain: defaultDomain = 'response',
}: {
    decisions?: AiDecisionClient;
    keyManagement?: AiKeyManagement;
    domain?: Exclude<ErrorDomain, 'query'>;
}) => {
    const pending = new WeakMap<Error, Promise<ErrorCategory | null>>();
    return async (
        error: unknown,
        defaultMessage: string = DEFAULT_ERROR_MESSAGE,
    ): Promise<string> => {
        if (!decisions)
            return defaultDomain === 'mcp'
                ? getLegacyMcpErrorMessage(
                      error instanceof Error ? error : new Error(String(error)),
                  )
                : getUserFacingErrorMessage(
                      error,
                      defaultMessage,
                      keyManagement,
                  );
        const domain = isMcpError(error) ? 'mcp' : defaultDomain;
        const known =
            domain === 'mcp'
                ? getKnownMcpErrorMessage(error)
                : getKnownUserFacingErrorMessage(error, keyManagement);
        if (known) return known;
        const fallback =
            domain === 'mcp' ? MCP_CONNECTION_MESSAGE : defaultMessage;
        if (
            !decisions ||
            (error instanceof Error && error.name === 'AbortError') ||
            (domain === 'response' && isProviderBillingError(error))
        )
            return fallback;
        let decision = error instanceof Error ? pending.get(error) : undefined;
        if (!decision) {
            decision = classifyUnknownError({
                decisions,
                error: getApiCallError(error) ?? error,
                domain,
            });
            if (error instanceof Error) pending.set(error, decision);
        }
        return (
            classifiedErrorMessage(await decision, domain, keyManagement) ??
            fallback
        );
    };
};
