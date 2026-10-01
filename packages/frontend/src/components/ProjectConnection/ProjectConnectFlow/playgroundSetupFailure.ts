import { isApiError } from '@lightdash/common';

export type PlaygroundSetupFailure =
    | 'unavailable'
    | 'turned-off'
    | 'forbidden'
    | 'unknown';

export const getPlaygroundSetupFailure = (
    error: unknown,
): PlaygroundSetupFailure => {
    if (!isApiError(error)) return 'unknown';
    const { name, message } = error.error;
    if (name === 'ForbiddenError') return 'forbidden';
    if (name === 'NotFoundError') {
        if (message.includes('turned off')) return 'turned-off';
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
    'turned-off':
        'Sample data is turned off on this instance. Your invite is still ready below.',
    forbidden:
        "You don't have permission to create a sample project. Your invite is still ready below.",
    unknown:
        'Something went wrong while preparing your sample project. Your invite is still ready below.',
};

export const SAMPLE_DATA_FAILURE_MESSAGES: Record<
    PlaygroundSetupFailure,
    string
> = {
    unavailable: 'Sample data is not available on this instance.',
    'turned-off': 'Sample data is turned off on this instance.',
    forbidden: 'You do not have permission to add sample data.',
    unknown: 'Something went wrong while preparing sample data. Try again.',
};

export const isRetryablePlaygroundSetupFailure = (
    failure: PlaygroundSetupFailure,
): boolean => failure === 'unknown';
