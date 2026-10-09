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

export type ControlsSidebarSection = 'fields' | 'settings';

export type ControlsSidebarContextValue = {
    /** The filter control being edited, or null when the sidebar is closed. */
    editing: { filterId: string } | null;
    /** The edited control was started with Add in this sidebar session. */
    isNew: boolean;
    /** The edited control has no mapping yet, so it cannot be kept. */
    isPlaceholder: boolean;
    editingRule: DashboardFilterRule | null;
    isSidebarOpen: boolean;
    activeSection: ControlsSidebarSection;
    setActiveSection: (section: ControlsSidebarSection) => void;
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
     * Like `addFirstField`, started from a tile: the filter is on that tile
     * only, and every other tile it would reach is left out.
     */
    addFirstFieldOnTile: (
        field: DashboardFilterableField,
        tileUuid: string,
    ) => void;
    /** Field whose tiles are outlined after a click on its row. */
    highlightedFieldId: string | null;
    setHighlightedFieldId: (fieldId: string | null) => void;
    /** Unclicks the field and drops its hover, so every tile shows again. */
    clearHighlightedField: () => void;
    hoveredFieldId: string | null;
    setHoveredFieldId: (fieldId: string | null) => void;
    /** The hovered field wins over the clicked one. */
    activeFieldId: string | null;
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
