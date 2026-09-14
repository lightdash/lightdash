import { useSyncExternalStore } from 'react';

/**
 * What the learner has done with walkthroughs, kept in the browser for now:
 * the ones finished (Got it on the last step), the ones started, and the
 * last one started (the library's Resume card). Progress is per learner and
 * nothing else reads it yet.
 */
const COMPLETED_KEY = 'lightdash.learn.completed';
const STARTED_KEY = 'lightdash.learn.started';
const LAST_KEY = 'lightdash.learn.lastStarted';
const CHANGE_EVENT = 'lightdash:learn-progress';

const readList = (key: string): string[] => {
    try {
        const raw = localStorage.getItem(key);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed)
            ? parsed.filter((x): x is string => typeof x === 'string')
            : [];
    } catch {
        return [];
    }
};
const readLast = (): string | null => {
    try {
        return localStorage.getItem(LAST_KEY);
    } catch {
        return null;
    }
};
const write = (fn: () => void) => {
    try {
        fn();
        window.dispatchEvent(new Event(CHANGE_EVENT));
    } catch {
        // storage unavailable: the walkthrough still runs
    }
};

export const markScopeCompleted = (scope: string) =>
    write(() => {
        localStorage.setItem(
            COMPLETED_KEY,
            JSON.stringify([...new Set([...readList(COMPLETED_KEY), scope])]),
        );
    });

export const markScopeStarted = (scope: string) =>
    write(() => {
        localStorage.setItem(
            STARTED_KEY,
            JSON.stringify([...new Set([...readList(STARTED_KEY), scope])]),
        );
        localStorage.setItem(LAST_KEY, scope);
    });

type LearnProgress = {
    completed: string[];
    started: string[];
    lastStarted: string | null;
};

// The store's snapshot must be the same object while nothing changed, so
// it is rebuilt only when the stored text differs from the last read.
let snapshot: LearnProgress | null = null;
let snapshotKey = '';
const readProgress = (): LearnProgress => {
    const completed = readList(COMPLETED_KEY);
    const started = readList(STARTED_KEY);
    const lastStarted = readLast();
    const key = JSON.stringify([completed, started, lastStarted]);
    if (snapshot === null || key !== snapshotKey) {
        snapshotKey = key;
        snapshot = { completed, started, lastStarted };
    }
    return snapshot;
};
const subscribe = (onChange: () => void) => {
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
        window.removeEventListener(CHANGE_EVENT, onChange);
        window.removeEventListener('storage', onChange);
    };
};

export const useLearnProgress = (): LearnProgress =>
    useSyncExternalStore(subscribe, readProgress, readProgress);
