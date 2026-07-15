import { createContext } from 'react';

export type FilterBarPopoversState = {
    isRulesPopoverOpen: boolean;
    openRulesPopover: () => void;
    closeRulesPopover: () => void;
};

/**
 * Coordinates the Filter rules popover across the dashboard: the "Edit rules"
 * link in a filter chip popover can open the Filter rules popover.
 */
export const FilterBarPopoversContext =
    createContext<FilterBarPopoversState | null>(null);
