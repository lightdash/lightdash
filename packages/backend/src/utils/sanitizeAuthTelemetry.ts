const sensitiveQueryKeys = new Set([
    'downloadtoken',
    'c',
    'code',
    'token',
    'client_secret',
    'code_verifier',
    'verification_code',
]);

export const sanitizeRequestUrl = (url: string): string =>
    url.replace(
        /(^|[?&])([^?=&#\s]+)=([^&#\s]*)/g,
        (match, prefix: string, key: string) => {
            try {
                return sensitiveQueryKeys.has(
                    decodeURIComponent(key).toLowerCase(),
                )
                    ? `${prefix}${key}=[REDACTED]`
                    : match;
            } catch {
                return match;
            }
        },
    );

const sensitiveKeys = new Set([
    'c',
    'code',
    'token',
    'client_secret',
    'code_verifier',
    'codeVerifier',
    'code_challenge',
    'codeChallenge',
    'verification_code',
    'verificationCode',
    'access_token',
    'refresh_token',
]);

export const sanitizeAuthTelemetry = <T>(value: T): T => {
    const seen = new WeakSet<object>();
    const sanitize = (item: unknown): unknown => {
        if (typeof item === 'string') {
            if (item.startsWith('{') || item.startsWith('[')) {
                try {
                    return JSON.stringify(sanitize(JSON.parse(item)));
                } catch {
                    return sanitizeRequestUrl(item);
                }
            }
            return sanitizeRequestUrl(item);
        }
        if (item === null || typeof item !== 'object') return item;
        if (seen.has(item)) return '[REDACTED]';
        seen.add(item);
        if (Array.isArray(item)) {
            if (
                item.length === 2 &&
                typeof item[0] === 'string' &&
                sensitiveKeys.has(item[0])
            )
                return [item[0], '[REDACTED]'];
            return item.map(sanitize);
        }
        return Object.fromEntries(
            Object.entries(item).map(([key, entry]) => [
                key,
                sensitiveKeys.has(key) ? '[REDACTED]' : sanitize(entry),
            ]),
        );
    };
    return sanitize(value) as T;
};
