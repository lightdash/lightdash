import { useMemo, useSyncExternalStore } from 'react';

// What is typed into a field and not saved outlives the field being closed, so opening another one loses nothing
const unsaved = new Map<string, string>();
const watchers = new Set<() => void>();
export const keep = (key: string, text: string | null) => {
    if (text === null) unsaved.delete(key);
    else unsaved.set(key, text);
    watchers.forEach((notify) => notify());
};
const watch = (notify: () => void) => {
    watchers.add(notify);
    return () => {
        watchers.delete(notify);
    };
};

/** The fields of a model that hold typing not saved yet, by name. */
export const useUnsavedFields = (projectUuid: string, modelName: string) => {
    const size = useSyncExternalStore(watch, () => unsaved.size);
    const prefix = `${projectUuid}:${modelName}:`;
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
