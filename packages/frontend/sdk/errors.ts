import { getErrorMessage, isApiError } from '@lightdash/common';
import { type QueryKey } from '@tanstack/react-query';

export type SdkErrorKind =
    | 'network'
    | 'token_expired'
    | 'invalid_token'
    | 'unauthorized'
    | 'forbidden'
    | 'not_found'
    | 'invalid_request'
    | 'server'
    | 'render'
    | 'unknown';

export type SdkError = {
    kind: SdkErrorKind;
    status: number | null;
    message: string;
    retryable: boolean;
    // The component replaced its whole content with an error screen
    fatal: boolean;
};

export type SdkErrorHandler = (error: SdkError) => void;

// Requests whose failure replaces the whole embed with an error screen
const FATAL_REQUEST_KEYS = new Set<unknown>([
    'embed-dashboard',
    'saved_query',
    'tables',
    'dashboard_create',
]);

const isFatalKey = (key: QueryKey | null) =>
    key !== null && FATAL_REQUEST_KEYS.has(key[0]);

const getKindFromApiError = (
    name: string,
    status: number,
    message: string,
): SdkErrorKind => {
    if (name === 'NetworkError') return 'network';
    if (/jwt expired|embed token has expired/i.test(message))
        return 'token_expired';
    if (/invalid embed token/i.test(message)) return 'invalid_token';
    if (status === 401) return 'unauthorized';
    if (status === 403) return 'forbidden';
    if (status === 404) return 'not_found';
    if (status >= 400 && status < 500) return 'invalid_request';
    return 'server';
};

const isRetryable = (kind: SdkErrorKind, status: number | null) =>
    kind === 'network' ||
    status === 429 ||
    (kind === 'server' && status !== null && status >= 500);

export const toSdkError = (
    error: unknown,
    { fatal, kind }: { fatal: boolean; kind?: SdkErrorKind },
): SdkError => {
    if (isApiError(error)) {
        const { name, statusCode, message } = error.error;
        const resolvedKind =
            kind ?? getKindFromApiError(name, statusCode, message);
        // Transport failures never got an HTTP response
        const status = resolvedKind === 'network' ? null : statusCode;
        return {
            kind: resolvedKind,
            status,
            message,
            retryable: isRetryable(resolvedKind, status),
            fatal,
        };
    }
    const resolvedKind = kind ?? 'unknown';
    return {
        kind: resolvedKind,
        status: null,
        message: getErrorMessage(error),
        retryable: isRetryable(resolvedKind, null),
        fatal,
    };
};

const TOKEN_ERROR_KINDS: SdkErrorKind[] = ['token_expired', 'invalid_token'];

export const toSdkRequestError = (
    error: unknown,
    key: QueryKey | null,
): SdkError => {
    const sdkError = toSdkError(error, { fatal: isFatalKey(key) });
    // Every request fails with a bad token, so the embed can't recover
    return TOKEN_ERROR_KINDS.includes(sdkError.kind)
        ? { ...sdkError, fatal: true }
        : sdkError;
};

// After a fatal error the embed is unusable until it remounts, so later
// failures from in-flight requests are dropped
export const createSdkErrorReporter = (
    getHandler: () => SdkErrorHandler | undefined,
) => {
    let hasReportedFatal = false;
    return (error: SdkError) => {
        if (hasReportedFatal) return;
        hasReportedFatal = error.fatal;
        getHandler()?.(error);
    };
};
