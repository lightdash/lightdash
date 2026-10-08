import { useEffect } from 'react';

// Marks the editor root: Escape closes the editor only from inside it
export const EDITOR_ATTRIBUTE = 'data-controls-editor';
// Marks an input that handles Escape itself while its list is closed
const OWN_ESCAPE_ATTRIBUTE = 'data-own-escape';

// An open list, menu or popover owns Escape; so does a modal. A Mantine
// combobox target is marked `data-expanded` while its list is open
const OPEN_LAYER_SELECTOR = [
    '[aria-expanded="true"][aria-haspopup]',
    '[data-expanded][aria-haspopup]',
    '[aria-expanded="true"][role="combobox"]',
    '[aria-modal="true"]',
].join(',');

type Args = {
    isOpen: boolean;
    close: () => void;
};

// One Escape listener while the editor is open, so one press does one thing:
// an open list closes itself, else the editor closes.
export const useEditorDismiss = ({ isOpen, close }: Args) => {
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape' || event.defaultPrevented) return;
            if (event.isComposing) return;
            const target =
                event.target instanceof Element ? event.target : null;
            if (target?.closest(`[${OWN_ESCAPE_ATTRIBUTE}]`)) return;
            // The query devtools of a dev build always report an open panel
            const hasOpenLayer = [
                ...document.querySelectorAll(OPEN_LAYER_SELECTOR),
            ].some((element) => !element.closest('.ReactQueryDevtools'));
            if (hasOpenLayer) return;
            if (!target?.closest(`[${EDITOR_ATTRIBUTE}]`)) return;
            // Blur commits a label that is still being typed
            if (document.activeElement instanceof HTMLElement)
                document.activeElement.blur();
            close();
        };
        // Capture: lists are still open when this runs, so they can be seen
        document.addEventListener('keydown', handleKeyDown, true);
        return () =>
            document.removeEventListener('keydown', handleKeyDown, true);
    }, [isOpen, close]);
};
