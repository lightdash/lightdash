import { WarehouseConnectionError } from '@lightdash/common';

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

export const isBigqueryServiceAccountAuthError = (
    error: unknown,
    ancestors = new Set<unknown>(),
): boolean => {
    if (!isRecord(error) || ancestors.has(error)) return false;
    const nextAncestors = new Set(ancestors).add(error);
    if (
        error.code === 401 ||
        error.status === 401 ||
        error.statusCode === 401 ||
        error.code === 'UNAUTHENTICATED' ||
        error.status === 'UNAUTHENTICATED' ||
        error.error === 'invalid_grant'
    )
        return true;
    if (
        error.reason === 'invalidQuery' ||
        error.reason === 'accessDenied' ||
        error.reason === 'quotaExceeded'
    )
        return false;
    if (
        typeof error.message === 'string' &&
        (/(?:^|Google rejected the BigQuery credentials \()invalid_grant\b|^\s*(?:16[ :]+)?UNAUTHENTICATED\b|^invalid JWT signature\b/i.test(
            error.message,
        ) ||
            /^(?:The )?(?:service[ -])?account (?:has been |was |is )?(?:disabled|deleted)\b/i.test(
                error.message,
            ))
    )
        return true;
    if (
        error instanceof WarehouseConnectionError &&
        /\binvalid JWT signature\b/i.test(error.message)
    )
        return true;
    return (
        ['cause', 'response', 'data', 'error'].some((key) =>
            isBigqueryServiceAccountAuthError(error[key], nextAncestors),
        ) ||
        (Array.isArray(error.errors) &&
            error.errors.some((entry) =>
                isBigqueryServiceAccountAuthError(entry, nextAncestors),
            ))
    );
};

export const isDatabricksServiceAccountAuthError = (
    error: unknown,
    ancestors = new Set<unknown>(),
): boolean => {
    if (!isRecord(error) || ancestors.has(error)) return false;
    const nextAncestors = new Set(ancestors).add(error);
    if (
        error.statusCode === 401 ||
        error.status === 401 ||
        error.error === 'invalid_client' ||
        error.error === 'invalid_grant' ||
        error.error_code === 'UNAUTHENTICATED'
    )
        return true;
    if (
        error instanceof WarehouseConnectionError &&
        /^Received a response with a bad HTTP status code: 401$/.test(
            error.message,
        )
    )
        return true;
    return ['cause', 'response', 'data', 'error'].some((key) =>
        isDatabricksServiceAccountAuthError(error[key], nextAncestors),
    );
};
