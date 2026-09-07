import { useCallback, useEffect, useState } from 'react';

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

export const useLearnProgress = () => {
    const [state, setState] = useState(() => ({
        completed: readList(COMPLETED_KEY),
        started: readList(STARTED_KEY),
        lastStarted: readLast(),
    }));
    const refresh = useCallback(
        () =>
            setState({
                completed: readList(COMPLETED_KEY),
                started: readList(STARTED_KEY),
                lastStarted: readLast(),
            }),
        [],
    );
    useEffect(() => {
        window.addEventListener(CHANGE_EVENT, refresh);
        window.addEventListener('storage', refresh);
        return () => {
            window.removeEventListener(CHANGE_EVENT, refresh);
            window.removeEventListener('storage', refresh);
        };
    }, [refresh]);
    return state;
};
