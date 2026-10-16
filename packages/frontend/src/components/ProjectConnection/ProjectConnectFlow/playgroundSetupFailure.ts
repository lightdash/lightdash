import { isApiError } from '@lightdash/common';
import i18n from '../../../i18n/i18n';

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

const tFailure = (key: string) =>
    i18n.t(`connectFlow.playgroundSetupFailure.${key}`, {
        ns: 'projectConnection',
    });

// Getters resolve lazily so messages follow the active language
export const PLAYGROUND_SETUP_FAILURE_MESSAGES: Record<
    PlaygroundSetupFailure,
    string
> = {
    get unavailable() {
        return tFailure('unavailable');
    },
    get 'previously-removed'() {
        return tFailure('previouslyRemoved');
    },
    get forbidden() {
        return tFailure('forbidden');
    },
    get unknown() {
        return tFailure('unknown');
    },
};

export const isRetryablePlaygroundSetupFailure = (
    failure: PlaygroundSetupFailure,
): boolean => failure === 'unknown';
