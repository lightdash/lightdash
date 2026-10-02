import { isPersonalSignInExpiredMessage } from '@lightdash/common';

type ErrorWithApiShape = {
    error?: { message?: unknown; data?: { personalSignInExpired?: unknown } };
    message?: unknown;
};

export const isPersonalSignInExpiredError = (error: unknown): boolean => {
    if (typeof error !== 'object' || error === null) return false;
    const { error: apiError, message } = error as ErrorWithApiShape;
    if (apiError?.data?.personalSignInExpired === true) return true;
    const text =
        typeof apiError?.message === 'string'
            ? apiError.message
            : typeof message === 'string'
              ? message
              : null;
    return text !== null && isPersonalSignInExpiredMessage(text);
};
