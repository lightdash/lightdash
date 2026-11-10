import { createContext, useContext } from 'react';
import { type ControlPlacement } from './controlOrder';

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

/** Alt with an arrow on a pill of an editor's sectioned bar: moves it along the bar or between lines */
export type BarMove = (
    id: string,
    direction: 'left' | 'right' | 'up' | 'down',
) => void;

// Null outside an editor's sectioned bar
export const BarMoveContext = createContext<BarMove | null>(null);

export const useBarMove = () => useContext(BarMoveContext);

/** Where the sectioned bar's drag would land now, for the one drop line */
export const BarDropContext = createContext<ControlPlacement | null>(null);

export const MOVE_KEYS: Partial<
    Record<string, 'left' | 'right' | 'up' | 'down'>
> = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'up',
    ArrowDown: 'down',
};

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
