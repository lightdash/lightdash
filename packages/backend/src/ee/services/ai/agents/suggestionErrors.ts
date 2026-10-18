import { APICallError, RetryError } from 'ai';
import { z } from 'zod';

export type SuggestionFallbackReason =
    | 'schema'
    | 'provider'
    | 'parse'
    | 'timeout'
    | 'context_load';

export class SuggestionGenerationError extends Error {
    constructor(
        public readonly reason: SuggestionFallbackReason,
        public readonly cause: unknown,
    ) {
        super(`Suggestion generation failed: ${reason}`);
        this.name = 'SuggestionGenerationError';
    }
}

const timeoutDetailsSchema = z.object({
    name: z.string().optional(),
    code: z.string().optional(),
    message: z.string().optional(),
    cause: z.unknown().optional(),
});
const TIMEOUT_MESSAGE_PATTERN =
    /timeout|timed out|ETIMEDOUT|ECONNABORTED|UND_ERR_\w*TIMEOUT/i;

function isTimeout(error: unknown, depth = 0, providerCause = false): boolean {
    if (depth > 8) return false;
    if (typeof error === 'string')
        return providerCause && TIMEOUT_MESSAGE_PATTERN.test(error);
    const details = timeoutDetailsSchema.safeParse(error);
    if (!details.success) return false;
    const { name, code, message, cause } = details.data;
    if (name === 'TimeoutError' || name === 'AbortError') return true;
    if (
        code === 'ETIMEDOUT' ||
        code === 'ECONNABORTED' ||
        (code?.startsWith('UND_ERR_') && code.endsWith('TIMEOUT'))
    )
        return true;
    if (
        providerCause ||
        APICallError.isInstance(error) ||
        RetryError.isInstance(error)
    ) {
        if (message && TIMEOUT_MESSAGE_PATTERN.test(message)) return true;
        if (
            RetryError.isInstance(error) &&
            error.errors.some((retryCause) =>
                isTimeout(retryCause, depth + 1, true),
            )
        )
            return true;
        return isTimeout(cause, depth + 1, true);
    }
    return false;
}

export function classifySuggestionError(
    error: unknown,
): SuggestionFallbackReason {
    if (error instanceof SuggestionGenerationError) return error.reason;
    return isTimeout(error) ? 'timeout' : 'provider';
}
