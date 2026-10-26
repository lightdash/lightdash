import { useDebouncedCallback } from '@mantine/hooks';
import { useState } from 'react';

/** A local draft over a store value, committed debounced; call `flush` on blur so a pending edit lands before the next click. */
export const useDebouncedDraft = <T>(
    value: T,
    commit: (value: T) => void,
    { delay }: { delay: number },
): [T, (value: T) => void, () => void] => {
    const [draft, setDraft] = useState<{ value: T } | null>(null);
    const debounced = useDebouncedCallback(
        (next: T) => {
            commit(next);
            setDraft(null);
        },
        { delay, flushOnUnmount: true },
    );
    return [
        draft ? draft.value : value,
        (next: T) => {
            setDraft({ value: next });
            debounced(next);
        },
        () => debounced.flush(),
    ];
};
