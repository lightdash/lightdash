import { useDebouncedCallback } from '@mantine/hooks';
import { useState } from 'react';

/** A local draft over a store value, committed debounced; the store stays the truth. */
export const useDebouncedDraft = <T>(
    value: T,
    commit: (value: T) => void,
): [T, (value: T) => void] => {
    const [draft, setDraft] = useState<{ value: T } | null>(null);
    const flush = useDebouncedCallback(
        (next: T) => {
            commit(next);
            setDraft(null);
        },
        { delay: 300, flushOnUnmount: true },
    );
    return [
        draft ? draft.value : value,
        (next: T) => {
            setDraft({ value: next });
            flush(next);
        },
    ];
};
