export type ClaudeCliFailureCategory =
    | 'quota'
    | 'spend_limit'
    | 'billing'
    | 'rate_limit'
    | 'auth'
    | 'overloaded'
    | 'unknown';

export type ClaudeCliFailureClassification = {
    category: ClaudeCliFailureCategory;
    // False when retrying cannot succeed (bad credentials, exhausted
    // credits, hard usage caps) — callers should fail fast instead of
    // burning further attempts.
    retryable: boolean;
    // User-facing summary; null when the failure isn't a recognized
    // upstream-API condition.
    userMessage: string | null;
    // Human-readable error from the CLI's final `result` event (e.g.
    // "API Error: 400 Your organization has reached its monthly spend
    // limit."). Null when the CLI died before emitting one.
    providerDetail: string | null;
};

const USER_MESSAGES: Record<
    Exclude<ClaudeCliFailureCategory, 'unknown'>,
    string
> = {
    quota: "Couldn't generate the app — the AI provider account is out of credits.",
    spend_limit:
        "Couldn't generate the app — the AI provider account has reached its usage limit.",
    billing:
        "Couldn't generate the app — there's a billing issue with the AI provider account.",
    rate_limit:
        "Couldn't generate the app — the AI provider is rate-limiting requests. Try again in a few minutes.",
    auth: "Couldn't generate the app — the AI provider rejected the API credentials.",
    overloaded:
        'The AI provider is temporarily overloaded. Try again in a few minutes.',
};

const RETRYABLE: Record<ClaudeCliFailureCategory, boolean> = {
    quota: false,
    spend_limit: false,
    billing: false,
    auth: false,
    rate_limit: true,
    overloaded: true,
    unknown: true,
};

const classification = (
    category: ClaudeCliFailureCategory,
    providerDetail: string | null,
): ClaudeCliFailureClassification => ({
    category,
    retryable: RETRYABLE[category],
    userMessage: category === 'unknown' ? null : USER_MESSAGES[category],
    providerDetail,
});

/**
 * The CLI rewrites upstream API errors into its own phrasing before emitting
 * them (e.g. a 401 becomes "Failed to authenticate. API Error: 401 API key is
 * invalid."), so these patterns cover both raw API signatures (Bedrock/Vertex
 * errors pass through on stderr) and the CLI's rewritten strings.
 */
const categoryFromText = (haystack: string): ClaudeCliFailureCategory => {
    if (/credit balance|insufficient_quota/.test(haystack)) {
        return 'quota';
    }
    // "usage limit reached" is the Claude subscription (OAuth token) cap;
    // "spend limit" is the Anthropic Console monthly org cap.
    if (/spend limit|usage limit/.test(haystack)) {
        return 'spend_limit';
    }
    if (/rate.?limit|throttlingexception/.test(haystack)) {
        return 'rate_limit';
    }
    if (
        /invalid_api_key|authentication_error|accessdeniedexception|failed to authenticate|api key is invalid/.test(
            haystack,
        )
    ) {
        return 'auth';
    }
    if (/overloaded_error|serviceunavailableexception/.test(haystack)) {
        return 'overloaded';
    }
    return 'unknown';
};

/**
 * The CLI's final stream-json `result` event, which carries structured
 * failure fields alongside a human-readable `result` message:
 * `{"type":"result","is_error":true,"api_error_status":400,
 *   "result":"API Error: 400 ...", ...}`
 */
type CliResultEvent = {
    isError: boolean;
    apiErrorStatus: number | null;
    resultText: string | null;
};

function parseCliResultEvent(stdout: string): CliResultEvent | null {
    const lines = stdout.split('\n');
    for (let i = lines.length - 1; i >= 0; i -= 1) {
        const line = lines[i].trim();
        if (!line.startsWith('{') || !line.includes('"type":"result"')) {
            // eslint-disable-next-line no-continue
            continue;
        }
        try {
            const event = JSON.parse(line) as Record<string, unknown>;
            if (event.type !== 'result') {
                // eslint-disable-next-line no-continue
                continue;
            }
            return {
                isError: event.is_error === true,
                apiErrorStatus:
                    typeof event.api_error_status === 'number'
                        ? event.api_error_status
                        : null,
                resultText:
                    typeof event.result === 'string' ? event.result : null,
            };
        } catch {
            // Not valid JSON despite looking like a result line — keep scanning.
        }
    }
    return null;
}

/**
 * Classifies a Claude CLI non-zero exit. Prefers the structured
 * `api_error_status` from the CLI's final `result` event (emitted to stdout
 * in stream-json mode — stderr alone is often empty); falls back to scanning
 * stdout + stderr for known error signatures when no result event parsed.
 */
export function classifyClaudeCliFailure(
    stderr: string,
    stdout: string,
): ClaudeCliFailureClassification {
    const resultEvent = parseCliResultEvent(stdout);
    const providerDetail = resultEvent?.resultText ?? null;
    const haystack =
        `${providerDetail ?? ''}\n${stderr}\n${stdout}`.toLowerCase();

    const status = resultEvent?.isError ? resultEvent.apiErrorStatus : null;
    if (status !== null) {
        if (status === 401 || status === 403) {
            return classification('auth', providerDetail);
        }
        if (status === 402) {
            return classification('billing', providerDetail);
        }
        if (status === 429) {
            return classification('rate_limit', providerDetail);
        }
        if (status >= 500) {
            return classification('overloaded', providerDetail);
        }
        // Remaining 4xxs carry the interesting cases (credit balance, spend
        // limit) only in the message text.
        const textCategory = categoryFromText(haystack);
        if (textCategory !== 'unknown') {
            return classification(textCategory, providerDetail);
        }
        // A definite 4xx won't succeed on retry even when we can't name it.
        return {
            category: 'unknown',
            retryable: false,
            userMessage: null,
            providerDetail,
        };
    }

    return classification(categoryFromText(haystack), providerDetail);
}

/**
 * Thrown by the generation step when it gives up — either retries are
 * exhausted or the failure is a non-retryable upstream condition (bad
 * credentials, exhausted credits, usage caps). Carries the classification so
 * the outer pipeline can surface a meaningful user message (falling back to a
 * generic one when `userMessage` is null) and the provider's own error text.
 */
export class ClaudeGenerationError extends Error {
    readonly userMessage: string | null;

    readonly category: ClaudeCliFailureCategory;

    readonly providerDetail: string | null;

    constructor(opts: {
        message: string;
        userMessage: string | null;
        category: ClaudeCliFailureCategory;
        providerDetail: string | null;
    }) {
        super(opts.message);
        this.name = 'ClaudeGenerationError';
        this.userMessage = opts.userMessage;
        this.category = opts.category;
        this.providerDetail = opts.providerDetail;
    }
}
