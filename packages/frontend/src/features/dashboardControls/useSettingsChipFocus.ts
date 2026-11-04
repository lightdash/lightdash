import { useCallback, useRef } from 'react';

// The value view takes focus on open; back from Settings, the chip that
// opened it does instead (it remounts, so a ref callback hands it focus)
export const useSettingsChipFocus = (
    focusOnOpen: (node: HTMLElement | null) => void,
) => {
    const isBackFromSettings = useRef(false);
    const focusValueView = useCallback(
        (node: HTMLElement | null) => {
            if (!isBackFromSettings.current) focusOnOpen(node);
        },
        [focusOnOpen],
    );
    const focusSettingsChip = useCallback((node: HTMLElement | null) => {
        if (node === null || !isBackFromSettings.current) return;
        isBackFromSettings.current = false;
        node.focus({ preventScroll: true });
    }, []);
    const markBackFromSettings = useCallback(() => {
        isBackFromSettings.current = true;
    }, []);
    return { focusValueView, focusSettingsChip, markBackFromSettings };
};
