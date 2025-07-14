import { captureException } from '@sentry/react';

export const getFromLocalStorage = <T>(key: string): T | null => {
    try {
        const item = localStorage.getItem(key);
        if (!item) return null;

        const parsed = JSON.parse(item);
        return parsed as T;
    } catch (err) {
        // We don't want to block the app from loading, so we capture the error and continue
        captureException(err, {
            tags: {
                key,
                errorType: 'localStorageParsingError',
            },
        });
        return null;
    }
};
