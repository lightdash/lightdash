import { useLocalStorage, useSessionStorage } from '@mantine/hooks';
import { useCallback } from 'react';
import { AUTO_FETCH_ENABLED_DEFAULT, AUTO_FETCH_ENABLED_KEY } from './defaults';

const AUTO_FETCH_SESSION_KEY = 'lightdash-explorer-auto-fetch-session';

/**
 * Whether queries re-run on every change. On either as a saved preference or
 * for this browser tab only.
 */
export const useAutoFetch = () => {
    const [isSaved, setIsSaved] = useLocalStorage({
        key: AUTO_FETCH_ENABLED_KEY,
        defaultValue: AUTO_FETCH_ENABLED_DEFAULT,
    });
    const [isSession, setIsSession] = useSessionStorage({
        key: AUTO_FETCH_SESSION_KEY,
        defaultValue: false,
    });
    const isEnabled = isSaved || isSession;

    // The switch: off clears both, on saves the preference
    const toggle = useCallback(() => {
        setIsSession(false);
        setIsSaved(!isEnabled);
    }, [isEnabled, setIsSaved, setIsSession]);

    const enableForSession = useCallback(
        () => setIsSession(true),
        [setIsSession],
    );

    return { isEnabled, toggle, enableForSession };
};
