import { useSyncExternalStore } from 'react';

export const EXPLORER_TOUR_STORAGE_KEY = 'ld.explorer.tour.v1';

// Whether the main tour is on screen, so hints can stay out of its way
let isTourOpen = false;
const listeners = new Set<() => void>();

export const setExplorerTourOpen = (open: boolean) => {
    isTourOpen = open;
    listeners.forEach((listener) => listener());
};

export const useIsExplorerTourOpen = () =>
    useSyncExternalStore(
        (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        () => isTourOpen,
    );
