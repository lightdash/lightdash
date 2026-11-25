import { isApiError } from '@lightdash/common';

export type PlaygroundSetupFailure =
    | 'unavailable'
    | 'previously-removed'
    | 'forbidden'
    | 'unknown';

export const getPlaygroundSetupFailure = (
    error: unknown,
): PlaygroundSetupFailure => {
    if (!isApiError(error)) return 'unknown';
    const { name, message } = error.error;
    if (name === 'ForbiddenError') return 'forbidden';
    if (name === 'NotFoundError') {
        if (message.includes('previously removed')) return 'previously-removed';
        if (message.includes('not available')) return 'unavailable';
    }
    return 'unknown';
};
