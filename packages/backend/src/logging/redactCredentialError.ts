const errorCategories: readonly [string, RegExp][] = [
    ['invalid_grant', /\binvalid_grant\b/i],
    ['invalid_client', /\binvalid_client\b/i],
    [
        'token_expired',
        /\b(token|session|jwt)\b[^\n]{0,40}\bexpired\b|\bexpired\b[^\n]{0,40}\b(token|session|jwt)\b/i,
    ],
    [
        'authentication_failed',
        /incorrect username or password|authentication failed|\bunauthori[sz]ed\b|\b401\b/i,
    ],
    [
        'permission_denied',
        /access denied|permission denied|does not have [^\n]{0,80}permission|\bforbidden\b|\b403\b|insufficient privileges/i,
    ],
    ['not_found', /\bnot found\b|does not exist|\b404\b/i],
    [
        'network',
        /\b(ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up)\b/i,
    ],
    ['timeout', /\btimed? ?out\b/i],
];

export const redactCredentialError = (
    error: unknown,
): {
    errorClass: string;
    errorCode: string | null;
    errorCategory: string | null;
    errorMessage: string;
} => {
    try {
        const name = error instanceof Error ? error.name : 'Error';
        const details =
            typeof error === 'object' && error !== null
                ? (error as {
                      message: unknown;
                      code: unknown;
                      sqlState: unknown;
                  })
                : null;
        const code = details?.code ?? details?.sqlState;
        const errorCode =
            (typeof code === 'string' || typeof code === 'number') &&
            /^[A-Za-z0-9_.-]{1,40}$/.test(String(code))
                ? String(code)
                : null;
        const rawMessage = typeof error === 'string' ? error : details?.message;
        let message =
            typeof rawMessage === 'string'
                ? rawMessage.slice(0, 1000)
                : '[REDACTED]';
        const errorCategory =
            errorCategories.find(([, pattern]) => pattern.test(message))?.[0] ??
            null;
        message = message
            .replace(/[[{][\s\S]*$/, ' [REDACTED] ')
            .replace(
                /-----BEGIN[\s\S]*?(?:-----END[^-]*-----|$)/gi,
                ' [REDACTED] ',
            )
            .replace(/"[^"]*(?:"|$)/g, ' [REDACTED] ')
            .replace(/(^|[\s=:(])'[^']*(?:'|$)/g, '$1 [REDACTED] ')
            .replace(/`[^`]*(?:`|$)/g, ' [REDACTED] ');
        const sqlStart = message.search(
            /\b(?:SELECT|SHOW|DESCRIBE|DESC|WITH|INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|CALL|GRANT|REVOKE|COPY|TRUNCATE|USE|EXPLAIN|PUT|GET|LIST|EXECUTE|BEGIN|COMMIT|ROLLBACK|UNDROP|REMOVE)\b|\bselect\b[^\n]{0,200}?\bfrom\b/,
        );
        let suffix = sqlStart === -1 ? '' : ' [REDACTED SQL]';
        if (sqlStart !== -1) message = message.slice(0, sqlStart);
        const tokens: string[] = [];
        for (const token of message.split(/\s+/).filter(Boolean)) {
            const word = token.replace(/[.,:;!?)]$/, '').replace(/^\(/, '');
            const normalized = word
                .normalize('NFKC')
                .toLowerCase()
                .replace(/[_\-.]/g, '')
                .replace(/[^a-z]/g, '#');
            const credentialLabel =
                /password|passwd|passphrase|secret|token|apikey|privatekey|assertion|credential|authorization|bearer|cookie|session/.test(
                    normalized,
                ) ||
                /^(?:key|pwd|pin|otp|pat|code|state|basic|sig|signature)$/.test(
                    normalized,
                );
            const safe =
                (/^[A-Za-z]{1,24}$/.test(word) &&
                    /^(?:[a-z]+|[A-Z][a-z]+|[A-Z]+)$/.test(word)) ||
                /^\d{1,4}$/.test(word) ||
                word === "can't" ||
                word === "doesn't";
            const value = safe ? token : '[REDACTED]';
            if (value !== '[REDACTED]' || tokens.at(-1) !== value)
                tokens.push(value);
            if (credentialLabel) {
                suffix = ' [REDACTED]';
                break;
            }
        }
        if (suffix === ' [REDACTED]' && tokens.at(-1) === '[REDACTED]')
            suffix = '';
        return {
            errorClass:
                typeof name === 'string' &&
                /^[a-z][a-z0-9]*Error$|^Error$/i.test(name)
                    ? name
                    : 'Error',
            errorCode,
            errorCategory,
            errorMessage: (tokens.join(' ') + suffix).trim(),
        };
    } catch {
        return {
            errorClass: 'Error',
            errorCode: null,
            errorCategory: null,
            errorMessage: '[REDACTED]',
        };
    }
};
