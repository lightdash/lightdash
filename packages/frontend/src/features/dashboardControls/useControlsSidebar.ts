import {
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardParameterControl,
    type ParameterValue,
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
     * A control with no field is discarded; a parameter control left with no
     * label takes its first parameter's name.
     */
    close: () => void;
    isDirty: boolean;
    /** The parameter control being edited, or null. */
    editingControl: DashboardParameterControl | null;
    /** The edited parameter control was created in this sidebar session. */
    isNewControl: boolean;
    openControl: (controlId: string) => void;
    /** Turns the placeholder into a parameter control on the given parameter. */
    addParameterControl: (parameterKey: string) => void;
    /**
     * Like `addParameterControl`, started from a tile: every other tile that
     * uses the parameter is switched off. A tile that has not reported its
     * parameters yet is unknown here and stays on.
     */
    addParameterControlOnTile: (parameterKey: string, tileUuid: string) => void;
    updateControl: (next: DashboardParameterControl) => void;
    /** Sets the value of every parameter of the edited control. */
    setControlValue: (value: ParameterValue | null) => void;
    /** Removes the edited control; its parameters keep their values. */
    removeControl: () => void;
    removeControlById: (controlId: string) => void;
    /** Tiles added since the dashboard was last saved. */
    newTileUuids: string[];
    /** Link prompts the author skipped, as keys from `getLinkKey`. */
    dismissedLinks: string[];
    dismissLink: (tileUuid: string, ruleId: string) => void;
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
