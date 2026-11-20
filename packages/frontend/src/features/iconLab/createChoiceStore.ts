import { useSyncExternalStore } from 'react';

/** A browser-persisted choice from a fixed list, readable from any component. */
export const createChoiceStore = <Key extends string>(
    storageKey: string,
    keys: readonly Key[],
    fallback: Key,
) => {
    const listeners = new Set<() => void>();
    const isKey = (value: string | null): value is Key =>
        keys.some((key) => key === value);

    const readStored = (): Key => {
        try {
            const stored = window.localStorage.getItem(storageKey);
            return isKey(stored) ? stored : fallback;
        } catch {
            return fallback;
        }
    };

    let current: Key = readStored();

    const set = (key: Key) => {
        current = key;
        try {
            window.localStorage.setItem(storageKey, key);
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

    const getSnapshot = () => current;

    const useChoice = (): Key =>
        useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

    return { isKey, set, useChoice };
};
