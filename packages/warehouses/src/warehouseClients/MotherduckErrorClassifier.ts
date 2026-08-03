import { getErrorMessage } from '@lightdash/common';

export type MotherduckErrorClass = 'auth' | 'stale' | 'other';

const AUTH_ERROR_PATTERNS = [
    /authentication failed/i,
    /authentication error.*invalid token/i,
    /invalid motherduck token/i,
    /motherduck token.*(?:expired|invalid|rejected)/i,
    /not authenticated/i,
    /check your motherduck token/i,
    /unauthorized/i,
];

const STALE_ERROR_PATTERNS = [
    /connection.*(?:already )?closed/i,
    /closed.*connection/i,
    /database.*detached/i,
    /detached.*database/i,
    /instance.*closed/i,
    /invalidated.*database/i,
];

export const classifyMotherduckError = (
    error: unknown,
): MotherduckErrorClass => {
    const message = getErrorMessage(error);
    if (AUTH_ERROR_PATTERNS.some((pattern) => pattern.test(message))) {
        return 'auth';
    }
    if (STALE_ERROR_PATTERNS.some((pattern) => pattern.test(message))) {
        return 'stale';
    }
    return 'other';
};
