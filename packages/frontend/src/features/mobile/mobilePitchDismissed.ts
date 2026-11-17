import { useCallback, useState, useSyncExternalStore } from 'react';

export const MOBILE_PITCH_DISMISSED_KEY = 'lightdash-mobile-pitch-dismissed';

const listeners = new Set<() => void>();

export const hasDismissedMobilePitch = (): boolean => {
    try {
        return window.localStorage.getItem(MOBILE_PITCH_DISMISSED_KEY) !== null;
    } catch {
        return false;
    }
};

export const rememberMobilePitchDismissed = (): boolean => {
    try {
        window.localStorage.setItem(MOBILE_PITCH_DISMISSED_KEY, 'true');
        return true;
    } catch {
        return false;
    } finally {
        listeners.forEach((listener) => listener());
    }
};

const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === MOBILE_PITCH_DISMISSED_KEY) {
        listeners.forEach((listener) => listener());
    }
};

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    if (listeners.size === 1) window.addEventListener('storage', onStorage);
    return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
            window.removeEventListener('storage', onStorage);
        }
    };
};

const notDismissedOnServer = () => false;

export const useMobilePitchDismissed = () => {
    const stored = useSyncExternalStore(
        subscribe,
        hasDismissedMobilePitch,
        notDismissedOnServer,
    );
    const [dismissedThisSession, setDismissedThisSession] = useState(false);
    const dismiss = useCallback(() => {
        setDismissedThisSession(true);
        rememberMobilePitchDismissed();
    }, []);
    return { dismissed: stored || dismissedThisSession, dismiss };
};
