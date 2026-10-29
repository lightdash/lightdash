import { useEffect } from 'react';

// Marks the editor root: Escape closes the editor only from inside it
const EDITOR_ATTRIBUTE = 'data-controls-editor';
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

// The query devtools of a dev build always report an open panel
export const hasOpenLayer = () =>
    [...document.querySelectorAll(OPEN_LAYER_SELECTOR)].some(
        (element) => !element.closest('.ReactQueryDevtools'),
    );

// A pill's own click opens, switches or asks (`open`)
const PILL_SELECTOR = '[data-controls-pill]';

type Args = {
    isOpen: boolean;
    isFieldClicked: boolean;
    /** A question is open: Escape withdraws it from anywhere. */
    isAsking: boolean;
    clearField: () => void;
    /** Withdraws a pending question, else cancels the edit. */
    dismiss: () => void;
    /** A press outside the editor: closes a clean edit, else asks. */
    dismissOutside: () => void;
};

// One Escape listener while the editor is open, so one press does one thing:
// an open list closes itself, else the clicked field is cleared, else the
// editor is dismissed. A mouse down never clears the field. A press outside
// the editor, a pill and any open list dismisses it the same way
export const useEditorDismiss = ({
    isOpen,
    isFieldClicked,
    isAsking,
    clearField,
    dismiss,
    dismissOutside,
}: Args) => {
    useEffect(() => {
        if (!isOpen) return;
        const handlePointerDown = (event: PointerEvent) => {
            const target =
                event.target instanceof Element ? event.target : null;
            if (target?.closest(`[${EDITOR_ATTRIBUTE}], ${PILL_SELECTOR}`))
                return;
            // The press closes the open list, and only that
            if (hasOpenLayer()) return;
            dismissOutside();
        };
        // Capture: a list is still open when this runs
        document.addEventListener('pointerdown', handlePointerDown, true);
        return () =>
            document.removeEventListener(
                'pointerdown',
                handlePointerDown,
                true,
            );
    }, [isOpen, dismissOutside]);
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape' || event.defaultPrevented) return;
            if (event.isComposing) return;
            const target =
                event.target instanceof Element ? event.target : null;
            if (target?.closest(`[${OWN_ESCAPE_ATTRIBUTE}]`)) return;
            if (hasOpenLayer()) return;
            if (isFieldClicked) {
                clearField();
                return;
            }
            if (!isAsking && !target?.closest(`[${EDITOR_ATTRIBUTE}]`)) return;
            // Blur commits a label that is still being typed
            if (document.activeElement instanceof HTMLElement)
                document.activeElement.blur();
            dismiss();
        };
        // Capture: lists are still open when this runs, so they can be seen
        document.addEventListener('keydown', handleKeyDown, true);
        return () =>
            document.removeEventListener('keydown', handleKeyDown, true);
    }, [isOpen, isFieldClicked, isAsking, clearField, dismiss]);
};
