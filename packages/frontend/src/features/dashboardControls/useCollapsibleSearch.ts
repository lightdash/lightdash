import { useRef, type KeyboardEvent } from 'react';

// For a search select that was opened by a button and can be put away again.
// It is dismissed when its list closes on an empty search, when focus leaves
// it, and on Escape once the list is closed. `byKeyboard` tells the caller to
// take focus back.
export const useCollapsibleSearch = (
    onDismiss: (byKeyboard: boolean) => void,
) => {
    const search = useRef('');
    const isListOpen = useRef(true);
    return {
        // The editor's own Escape handling leaves this input alone
        'data-own-escape': true,
        autoFocus: true,
        defaultDropdownOpened: true,
        onSearchChange: (value: string) => {
            search.current = value;
        },
        onDropdownOpen: () => {
            isListOpen.current = true;
        },
        onDropdownClose: () => {
            isListOpen.current = false;
            if (search.current === '') onDismiss(false);
        },
        onBlur: () => onDismiss(false),
        onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key !== 'Escape') return;
            if (!isListOpen.current || search.current === '') onDismiss(true);
        },
    };
};
