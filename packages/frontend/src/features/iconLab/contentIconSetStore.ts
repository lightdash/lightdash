import { useSyncExternalStore } from 'react';

export const CONTENT_ICON_SET_KEYS = ['current', 'a', 'b', 'c'] as const;
export type ContentIconSetKey = (typeof CONTENT_ICON_SET_KEYS)[number];

const STORAGE_KEY = 'lightdash-content-icon-set';
const listeners = new Set<() => void>();

const isSetKey = (value: string | null): value is ContentIconSetKey =>
    CONTENT_ICON_SET_KEYS.some((key) => key === value);

const readStored = (): ContentIconSetKey => {
    try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        return isSetKey(stored) ? stored : 'current';
    } catch {
        return 'current';
    }
};

let currentKey: ContentIconSetKey = readStored();

export const setContentIconSetKey = (key: ContentIconSetKey) => {
    currentKey = key;
    try {
        window.localStorage.setItem(STORAGE_KEY, key);
    } catch {
        // Storage can be blocked; the choice then lasts until reload.
    }
    listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

const getSnapshot = () => currentKey;

/** Which experimental content icon set the app draws with. */
export const useContentIconSetKey = (): ContentIconSetKey =>
    useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
