import { useMemo, useSyncExternalStore } from 'react';

type UnsavedEdit = { text: string; revision: string | null };

// Unsaved edits live for the tab only; leaving the page warns while any are kept.
const unsavedEdits = new Map<string, UnsavedEdit>();
let warnsOnLeave = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
export const keepUnsaved = (
    key: string,
    text: string,
    revision: string | null,
) => {
    const isNew = !unsavedEdits.has(key);
    unsavedEdits.set(key, { text, revision });
    if (isNew) notify();
    if (warnsOnLeave) return;
    warnsOnLeave = true;
    window.addEventListener('beforeunload', (event) => {
        if (unsavedEdits.size > 0) event.preventDefault();
    });
};

/** What is kept unsaved for a file; it stays kept until dropped. */
export const findUnsaved = (key: string): UnsavedEdit | null =>
    unsavedEdits.get(key) ?? null;

export const dropUnsaved = (key: string) => {
    if (unsavedEdits.delete(key)) notify();
};

/** Moves what is kept for one file to another, when there is any. */
export const moveUnsaved = (from: string, to: string) => {
    const kept = unsavedEdits.get(from);
    if (kept === undefined) return;
    dropUnsaved(from);
    keepUnsaved(to, kept.text, kept.revision);
};

/** An edit belongs to one file of one change; live has no pull request. */
export const unsavedEditKey = (
    projectUuid: string,
    prUrl: string | null,
    path: string | null,
) => `${projectUuid}\n${prUrl ?? ''}\n${path ?? ''}`;

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};
const keysSnapshot = () => [...unsavedEdits.keys()].join('\0');

/** The files of one change that have unsaved edits. */
export const useUnsavedPaths = (
    projectUuid: string,
    prUrl: string | null,
): Set<string> => {
    const keys = useSyncExternalStore(subscribe, keysSnapshot);
    return useMemo(() => {
        const prefix = unsavedEditKey(projectUuid, prUrl, '');
        return new Set(
            keys
                .split('\0')
                .filter((key) => key.startsWith(prefix) && key !== prefix)
                .map((key) => key.slice(prefix.length)),
        );
    }, [keys, projectUuid, prUrl]);
};
