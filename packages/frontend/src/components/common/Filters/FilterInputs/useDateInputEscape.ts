import { type DateInputProps } from '@mantine/dates';
import { useState, type KeyboardEvent } from 'react';

// DateInput closes its calendar on Escape but keeps the open state to itself
// and leaves the key unmarked, so a host modal closed on the same press
export const useDateInputEscape = (
    popoverProps: DateInputProps['popoverProps'],
    onKeyDown: DateInputProps['onKeyDown'],
) => {
    const [isOpen, setIsOpen] = useState(false);
    return {
        popoverProps: {
            ...popoverProps,
            onOpen: () => {
                popoverProps?.onOpen?.();
                setIsOpen(true);
            },
            onClose: () => {
                popoverProps?.onClose?.();
                setIsOpen(false);
            },
        },
        onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === 'Escape' && isOpen) event.preventDefault();
            onKeyDown?.(event);
        },
        'data-mantine-stop-propagation': isOpen || undefined,
    };
};
