export type ClaudeCliFailureCategory =
    | 'quota'
    | 'rate_limit'
    | 'auth'
    | 'overloaded'
    | 'unknown';

export type ClaudeCliFailureClassification =
    | {
          category: Exclude<ClaudeCliFailureCategory, 'unknown'>;
          userMessage: string;
      }
    | { category: 'unknown' };

/**
 * Classifies a Claude CLI non-zero exit by scanning its stdout + stderr
 * for known upstream-API error signatures. The CLI emits its `result`
 * event (including failure messages) to stdout in stream-json mode, so
 * stderr alone is often empty — both streams must be searched.
 */
export function classifyClaudeCliFailure(
    stderr: string,
    stdout: string,
): ClaudeCliFailureClassification {
    const haystack = `${stderr}\n${stdout}`.toLowerCase();

    if (/credit balance|insufficient_quota/.test(haystack)) {
        return {
            category: 'quota',
            userMessage:
                "Couldn't generate the app — the AI provider account is out of credits.",
        };
    }
    if (/rate.?limit|throttlingexception/.test(haystack)) {
        return {
            category: 'rate_limit',
            userMessage:
                "Couldn't generate the app — the AI provider is rate-limiting requests. Try again in a few minutes.",
        };
    }
    if (
        /invalid_api_key|authentication_error|accessdeniedexception/.test(
            haystack,
        )
    ) {
        return {
            category: 'auth',
            userMessage:
                "Couldn't generate the app — the AI provider rejected the API credentials.",
        };
    }
    if (/overloaded_error|serviceunavailableexception/.test(haystack)) {
        return {
            category: 'overloaded',
            userMessage:
                'The AI provider is temporarily overloaded. Try again in a few minutes.',
        };
    }

    return { category: 'unknown' };
}

/**
 * Thrown by the generation step when retries are exhausted AND the
 * failure was classified as a known upstream-API condition. Carries a
 * user-facing message so the outer pipeline can surface a meaningful
 * explanation instead of the generic "Try rephrasing" fallback. Unknown
 * failures throw a plain Error so the caller's default branch handles
 * them.
 */
export class ClaudeGenerationError extends Error {
    readonly userMessage: string;

    readonly category: Exclude<ClaudeCliFailureCategory, 'unknown'>;

    constructor(opts: {
        message: string;
        userMessage: string;
        category: Exclude<ClaudeCliFailureCategory, 'unknown'>;
    }) {
        super(opts.message);
        this.name = 'ClaudeGenerationError';
        this.userMessage = opts.userMessage;
        this.category = opts.category;
    }
}
