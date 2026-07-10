import { createContext } from 'react';

export type FilterBarPopoversState = {
    isRulesPopoverOpen: boolean;
    openRulesPopover: () => void;
    closeRulesPopover: () => void;
    /**
     * Open popover in the filter bar: a filter chip (keyed by the dashboard
     * filter rule id) or the add-filter popover (ad-hoc id).
     */
    openFilterPopoverId: string | undefined;
    openFilterPopover: (popoverId: string) => void;
    closeFilterPopover: () => void;
};

/**
 * Coordinates the filter bar popovers across the dashboard: the "Edit rule"
 * link in a filter chip popover can open the Filter rules popover, and the
 * required-filters banner can open a specific filter chip's popover.
 */
export const FilterBarPopoversContext =
    createContext<FilterBarPopoversState | null>(null);
