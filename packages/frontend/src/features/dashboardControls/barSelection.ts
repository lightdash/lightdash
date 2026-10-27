import { createContext, useContext } from 'react';

/** The pills picked on an editor's sectioned bar, to move or remove together */
export type BarSelection = {
    selectedIds: string[];
    /** Toggles the pill; a range selects from the pill toggled last, in bar order */
    pick: (id: string, isRange: boolean) => void;
    clear: () => void;
};

// Null outside an editor's sectioned bar: its pills select nothing
export const BarSelectionContext = createContext<BarSelection | null>(null);

export const useBarSelection = () => useContext(BarSelectionContext);
