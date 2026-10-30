import {
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardFilters,
    type ResultColumn,
} from '@lightdash/common';
import { type MutableRefObject } from 'react';
import {
    createContext,
    useContext,
    useContextSelector,
} from 'use-context-selector';

// A "Filter all tiles", a "Clear" or an added field that Undo can take back:
// its field, the tiles it applied the field to or cleared it from, how many
// an apply took off other fields, and whether it was over every tab of a
// dashboard with tabs
export type FieldApply = {
    kind: 'apply' | 'clear' | 'add';
    fieldId: string;
    tileCount: number;
    replaced: number;
    acrossTabs: boolean;
};

export type MoveDirection = 'left' | 'right';

export type ControlsSidebarContextValue = {
    /** The filter control being edited, or null when the sidebar is closed. */
    editing: { filterId: string } | null;
    /**
     * Outside edit mode: the editor writes the viewer's own temporary
     * filters only; saved filters keep the bar's shipped popover.
     */
    isViewer: boolean;
    /** False in an embed whose viewers may not add filters: no "Add filter". */
    canAddFilters: boolean;
    /** The edited control was started with Add in this sidebar session. */
    isNew: boolean;
    /** The edited control has no mapping yet, so it cannot be kept. */
    isPlaceholder: boolean;
    editingRule: DashboardFilterRule | null;
    /** The edited filter's set: its draft while a filter is open. */
    editorFilters: DashboardFilters;
    /**
     * A filter is being edited, so the rail is on screen: false as soon as
     * the edited filter is no longer in the dashboard.
     */
    isSidebarOpen: boolean;
    /** Choosing tiles: the mapping row stands in for the filter row and the popover. */
    isMapping: boolean;
    /** "Choose tiles" is offered: an editor's filter or a viewer's own, not a viewer's saved one. */
    canChooseTiles: boolean;
    /** "Choose tiles": enters mapping on the edited filter's draft. */
    startMapping: () => void;
    /** The mapping row's Cancel: tile targets back to where mapping started, and the popover again. */
    cancelMapping: () => void;
    /**
     * A pill, Add or a click outside met unapplied changes: the editor asks to
     * Apply or Discard first.
     */
    isAsking: boolean;
    /** Applies (true) or discards (false) the edit, then opens the pill clicked or the new filter, if any. */
    resolvePending: (isApply: boolean) => void;
    /**
     * A tile's data-point menu: opens at once, or, while the editor asks,
     * once the question is answered; never when it is withdrawn.
     */
    whenAnswered: (openMenu: () => void) => void;
    /** Edit mode: moves a pill one place among its kind in its section, on the dashboard at once; nothing at an end. */
    moveFilter: (filterId: string, direction: MoveDirection) => void;
    /**
     * A pill's click. Opens the filter; on the edited one it closes a clean
     * edit and focuses Apply otherwise; another filter switches a clean edit
     * and asks (`isAsking`) otherwise.
     */
    open: (filterId: string) => void;
    /** A new filter (a placeholder until its first field), in a section when one is given; asks first on unapplied changes. */
    openNew: (sectionId?: string) => void;
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
     * Takes the edited control's fields away and leaves it open as a
     * placeholder with the same id and label. It was a control's last field.
     */
    removeLastField: (fieldLabel: string | null) => void;
    /** The name of the field an emptied control lost, until it has one again. */
    emptiedFieldLabel: string | null;
    /** Field whose tiles are outlined after a click on its row. */
    highlightedFieldId: string | null;
    setHighlightedFieldId: (fieldId: string | null) => void;
    /** Unclicks the field and drops its hover, so every tile shows again. */
    clearHighlightedField: () => void;
    hoveredFieldId: string | null;
    setHoveredFieldId: (fieldId: string | null) => void;
    /** Which pill's filter marked the tiles on hover; stable for the provider's life. */
    tileHoverOwner: MutableRefObject<string | null>;
    /** The hovered field wins over the clicked one. */
    activeFieldId: string | null;
    /**
     * Fields listed on the edited filter that are on no tile yet. They only
     * live while the sidebar is open: a field is saved through a tile.
     */
    waitingFieldIds: string[];
    addWaitingField: (fieldId: string) => void;
    removeWaitingField: (fieldId: string) => void;
    /** Writes the edited filter to the draft; a section change reaches the dashboard at once. */
    updateFilter: (next: DashboardFilterRule) => void;
    /**
     * `updateFilter` for an "Apply to all", which `undoApply` can take back
     * when it changed the rule. A later write, another field clicked, another
     * control or the editor closing ends it.
     */
    applyWithUndo: (next: DashboardFilterRule, apply: FieldApply) => void;
    /** Puts the rule back as it was before the last apply, while it can. */
    undoApply: () => void;
    /** The last apply, while Undo can still take it back; else null. */
    fieldUndo: FieldApply | null;
    /** Writes filters other than the edited one to the draft, for Apply to take along. */
    updateOtherFilters: (rules: DashboardFilterRule[]) => void;
    /** The pill's X: on the edited filter it ends the edit too. */
    removeFilterById: (filterId: string) => void;
    /** Cancel: drops the draft and closes the editor; nothing reached the dashboard. */
    discard: () => void;
    /**
     * Apply: writes the draft to the dashboard once and closes the editor;
     * saving stays with the dashboard's own Save. A control with no field is
     * discarded.
     */
    close: () => void;
    /** Apply or Cancel would change something; a new filter with no field yet would not. */
    isDirty: boolean;
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

const openAtOnce = (openMenu: () => void) => openMenu();

/** A tile's data-point menu: waits while the editor asks; at once without the controls. */
export const useWhenAnswered = (): ((openMenu: () => void) => void) =>
    useContextSelector(
        ControlsSidebarContext,
        (context) => context?.whenAnswered ?? openAtOnce,
    );
