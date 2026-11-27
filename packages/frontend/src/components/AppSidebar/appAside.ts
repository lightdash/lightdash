import { useEffect, useSyncExternalStore } from 'react';

export const APP_ASIDE_ID = 'app-aside';
export const APP_ASIDE_HOST_ID = 'app-aside-host';

/** The aside's slide-away time in AppSidebar.module.css; its content has to outlive that. */
export const APP_ASIDE_CLOSE_DURATION_MS = 200;

// Lives outside React state: the panel that fills the slot is mounted above
// the shell that draws it.
let isOpen = false;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

const getSnapshot = () => isOpen;

const setIsOpen = (next: boolean): void => {
    if (isOpen === next) return;
    isOpen = next;
    listeners.forEach((listener) => listener());
};

/** Whoever portals content into the aside host says when it has something to show. */
export const usePublishAppAsideOpen = (open: boolean): void => {
    useEffect(() => {
        setIsOpen(open);
        return () => setIsOpen(false);
    }, [open]);
};

export const useIsAppAsideOpen = (): boolean =>
    useSyncExternalStore(subscribe, getSnapshot);
