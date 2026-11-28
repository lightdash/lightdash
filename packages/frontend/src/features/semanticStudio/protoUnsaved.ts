import { useMemo, useSyncExternalStore } from 'react';

/** Typing not saved yet, with the field's text as it was when the typing began. */
type Unsaved = { text: string; base: string };

// What is typed into a field and not saved outlives the field being closed, so opening another one loses nothing
const unsaved = new Map<string, Unsaved>();
const watchers = new Set<() => void>();
export const keep = (key: string, entry: Unsaved | null) => {
    if (entry === null) unsaved.delete(key);
    else unsaved.set(key, entry);
    watchers.forEach((notify) => notify());
};
const watch = (notify: () => void) => {
    watchers.add(notify);
    return () => {
        watchers.delete(notify);
    };
};

/** The fields that hold typing not saved yet, by name, within one project, draft and model. */
export const useUnsavedFields = (scope: string) => {
    const size = useSyncExternalStore(watch, () => unsaved.size);
    const prefix = `${scope}:`;
    return useMemo(
        () =>
            new Set(
                [...unsaved.keys()]
                    .filter((key) => key.startsWith(prefix))
                    .map((key) => key.slice(prefix.length)),
            ),
        // The size is what says the map changed
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [prefix, size],
    );
};

export const readUnsaved = (key: string) => unsaved.get(key);
