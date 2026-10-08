import { useDebouncedCallback } from '@mantine/hooks';
import { useEffect, useState } from 'react';

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

// The editor's label input, for the places that hand focus to it
const LABEL_SELECTOR = '[data-controls-label]';
export const focusLabelInput = () =>
    document.querySelector<HTMLInputElement>(LABEL_SELECTOR)?.focus();

// The sidebar fades in from `display: none`, where focus cannot land, so the
// editor keeps handing focus to its label for a few frames after it mounts.
// It stops as soon as the label has it, or the author moved into the editor
export const useFocusLabelOnMount = () => {
    useEffect(() => {
        let frame = 0;
        let tries = 0;
        const attempt = () => {
            const input =
                document.querySelector<HTMLInputElement>(LABEL_SELECTOR);
            if (input === null) return;
            if (document.activeElement?.closest('[data-controls-editor]'))
                return;
            input.focus();
            if (document.activeElement === input || tries >= 20) return;
            tries += 1;
            frame = requestAnimationFrame(attempt);
        };
        frame = requestAnimationFrame(attempt);
        return () => cancelAnimationFrame(frame);
    }, []);
};
