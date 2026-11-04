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

const countOf = (count: number, one: string, many: string) =>
    `${count} ${count === 1 ? one : many}`;

/** Picked pills by kind: "2 filters", "1 parameter", "2 filters and 1 parameter" */
export const formatPickedCount = (
    filterCount: number,
    parameterCount: number,
): string =>
    [
        filterCount > 0 && countOf(filterCount, 'filter', 'filters'),
        parameterCount > 0 &&
            countOf(parameterCount, 'parameter', 'parameters'),
    ]
        .filter(Boolean)
        .join(' and ');
