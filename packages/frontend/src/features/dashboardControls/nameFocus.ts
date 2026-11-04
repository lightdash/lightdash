import { useEffect, useRef } from 'react';

/** How naming ended: a key, a pointer, or a blur that took focus to
 * another element (which keeps it). */
export type NameExit = 'keyboard' | 'pointer' | 'elsewhere';

// Moves focus once naming ended, unless a blur took it to another element
// (Tab, a click on a control); no ring after a pointer
export const focusAfterNaming = (
    target: HTMLElement | null,
    exit: NameExit,
) => {
    if (exit === 'elsewhere') return;
    if (exit === 'pointer') target?.focus({ focusVisible: false });
    else target?.focus();
};

// Focus goes back to `ref` once the input unmounts (Enter, Escape, the
// check or X), never away from where a blur went
export const useRefocusAfter = (isEditing: boolean) => {
    const ref = useRef<HTMLButtonElement>(null);
    const exit = useRef<NameExit>('keyboard');
    const wasEditing = useRef(isEditing);
    useEffect(() => {
        if (wasEditing.current && !isEditing)
            focusAfterNaming(ref.current, exit.current);
        wasEditing.current = isEditing;
    }, [isEditing]);
    return { ref, exit };
};
