import { createContext } from 'react';

export type FilterRulesPopoverState = {
    isOpen: boolean;
    open: () => void;
    close: () => void;
};

/**
 * Shares the Filter rules popover open state across the filter bar so the
 * "Edit rules" link in a filter pill popover can open it.
 */
export const FilterRulesPopoverContext =
    createContext<FilterRulesPopoverState | null>(null);
