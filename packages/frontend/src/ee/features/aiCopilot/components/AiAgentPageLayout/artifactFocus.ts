import { useWindowEvent } from '@mantine/hooks';
import { createContext, useCallback, useContext, useState } from 'react';

export type ArtifactFocus = {
    isFocused: boolean;
    toggle: () => void;
};

/** Null outside the agent workspace, where the panel has no chat to hide. */
export const ArtifactFocusContext = createContext<ArtifactFocus | null>(null);

export const useArtifactFocusContext = () => useContext(ArtifactFocusContext);

const isWithinOverlay = (target: EventTarget | null) =>
    target instanceof Element &&
    target.closest('[role="dialog"], [role="menu"], [role="listbox"]') !== null;

/**
 * Focus belongs to the preview it was turned on for: opening another preview
 * or closing the panel shows the chat again, and nothing is remembered.
 */
export const useArtifactFocusMode = <T extends object>(
    preview: T | null,
): ArtifactFocus => {
    const [focusedPreview, setFocusedPreview] = useState<T | null>(null);
    const isFocused = preview !== null && focusedPreview === preview;

    const toggle = useCallback(() => {
        setFocusedPreview(isFocused ? null : preview);
    }, [isFocused, preview]);

    useWindowEvent('keydown', (event) => {
        if (
            !isFocused ||
            event.key !== 'Escape' ||
            event.defaultPrevented ||
            isWithinOverlay(event.target)
        )
            return;
        setFocusedPreview(null);
    });

    return { isFocused, toggle };
};
