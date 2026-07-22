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

export const PLAYGROUND_SETUP_FAILURE_MESSAGES: Record<
    PlaygroundSetupFailure,
    string
> = {
    unavailable:
        "Sample projects aren't available on this instance. Your invite is still ready below.",
    'previously-removed':
        "Your organization's sample project was removed and can't be set up again. Your invite is still ready below.",
    forbidden:
        "You don't have permission to create a sample project. Your invite is still ready below.",
    unknown:
        'Something went wrong while preparing your sample project. Your invite is still ready below.',
};

export const isRetryablePlaygroundSetupFailure = (
    failure: PlaygroundSetupFailure,
): boolean => failure === 'unknown';
