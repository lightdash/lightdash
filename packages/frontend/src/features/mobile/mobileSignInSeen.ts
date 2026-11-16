import { useCallback, useState, useSyncExternalStore } from 'react';

export const MOBILE_SIGN_IN_SEEN_KEY = 'lightdash-mobile-signin-popover-opened';

const listeners = new Set<() => void>();

export const hasOpenedMobileSignIn = (): boolean => {
    try {
        return window.localStorage.getItem(MOBILE_SIGN_IN_SEEN_KEY) !== null;
    } catch {
        return false;
    }
};

export const rememberMobileSignInOpened = (): boolean => {
    try {
        window.localStorage.setItem(MOBILE_SIGN_IN_SEEN_KEY, 'true');
        return true;
    } catch {
        return false;
    } finally {
        listeners.forEach((listener) => listener());
    }
};

const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === MOBILE_SIGN_IN_SEEN_KEY) {
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

const notOpenedOnServer = () => false;

export const useMobileSignInSeen = () => {
    const stored = useSyncExternalStore(
        subscribe,
        hasOpenedMobileSignIn,
        notOpenedOnServer,
    );
    const [seenThisSession, setSeenThisSession] = useState(false);
    const markSeen = useCallback(() => {
        setSeenThisSession(true);
        rememberMobileSignInOpened();
    }, []);
    return { seen: stored || seenThisSession, markSeen };
};
