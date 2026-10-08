import { useDebouncedCallback } from '@mantine/hooks';
import { useState } from 'react';

export const LABEL_COMMIT_DELAY = 300;

// Holds the label text while typing, so a keystroke never reaches the
// dashboard. Mount the caller with the control's id as key: the draft starts
// from `initial` once, and a pending commit dies with the component.
export const useLabelDraft = (
    initial: string,
    onCommit: (label: string) => void,
) => {
    const [draft, setDraft] = useState(initial);
    const commitLater = useDebouncedCallback(onCommit, LABEL_COMMIT_DELAY);
    return {
        draft,
        /** A keystroke: commits after a pause. */
        type: (next: string) => {
            setDraft(next);
            commitLater(next);
        },
        /** Commits what was typed now, synchronously; a no-op when nothing is pending. */
        flush: () => commitLater.flush(),
        /** Replaces the text and commits it at once. */
        set: (next: string) => {
            commitLater.cancel();
            setDraft(next);
            onCommit(next);
        },
    };
};
