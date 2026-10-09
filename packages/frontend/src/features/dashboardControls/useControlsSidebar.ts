import {
    type DashboardFilterableField,
    type DashboardFilterRule,
    type ResultColumn,
} from '@lightdash/common';
import {
    createContext,
    useContext,
    useContextSelector,
} from 'use-context-selector';

export type ControlsSidebarContextValue = {
    /** The filter control being edited, or null when the sidebar is closed. */
    editing: { filterId: string } | null;
    /** The edited control was started with Add in this sidebar session. */
    isNew: boolean;
    /** The edited control has no mapping yet, so it cannot be kept. */
    isPlaceholder: boolean;
    editingRule: DashboardFilterRule | null;
    isSidebarOpen: boolean;
    open: (filterId: string) => void;
    /** Opens a placeholder control; the first mapping decides what it is. */
    openNew: () => void;
    /** Turns the placeholder into a filter control on the given field. */
    addFirstField: (field: DashboardFilterableField) => void;
    /**
     * Turns the placeholder into a filter control on a SQL column, on every
     * SQL chart tile that has it. `availableTileColumns` is keyed by tile.
     */
    addFirstSqlColumn: (
        column: ResultColumn,
        availableTileColumns: Record<string, ResultColumn[]>,
    ) => void;
    /**
     * Fields listed on the edited filter that are on no tile yet. They only
     * live while the sidebar is open: a field is saved through a tile.
     */
    waitingFieldIds: string[];
    addWaitingField: (fieldId: string) => void;
    removeWaitingField: (fieldId: string) => void;
    updateFilter: (next: DashboardFilterRule) => void;
    /** Removes the edited filter and closes the sidebar. */
    removeFilter: () => void;
    removeFilterById: (filterId: string) => void;
    /** Restores the dashboard filters as they were when the sidebar opened. */
    discard: () => void;
    /**
     * Closes and keeps the edits; saving stays with the dashboard's own Save.
     * A control with no field is discarded.
     */
    close: () => void;
    isDirty: boolean;
};

export const ControlsSidebarContext =
    createContext<ControlsSidebarContextValue | null>(null);

const assertProvided = (
    context: ControlsSidebarContextValue | null,
): ControlsSidebarContextValue => {
    if (context === null) {
        throw new Error(
            'useControlsSidebar must be used within a ControlsSidebarProvider',
        );
    }
    return context;
};

/** The whole value: re-renders on every change. Prefer the selector. */
export const useControlsSidebar = (): ControlsSidebarContextValue =>
    assertProvided(useContext(ControlsSidebarContext));

/** Re-renders only when the selected slice changes. Callbacks are stable. */
export const useControlsSidebarSelector = <Selected>(
    selector: (value: ControlsSidebarContextValue) => Selected,
): Selected =>
    useContextSelector(ControlsSidebarContext, (context) =>
        selector(assertProvided(context)),
    );
