import {
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardParameterControl,
    type ParameterValue,
} from '@lightdash/common';
import { createContext, useContext } from 'react';

export type ControlsSidebarSection = 'fields' | 'settings';

export type ControlsSidebarContextValue = {
    /** The filter control being edited, or null when the sidebar is closed. */
    editing: { filterId: string } | null;
    /** The edited control was started with Add and is not applied yet. */
    isNew: boolean;
    /** The edited control has no mapping yet, so it cannot be applied. */
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
     * Removes every field of the edited filter, turning it back into a
     * placeholder that keeps its label and settings. Cancel restores it.
     */
    clearFields: () => void;
    /** Field whose tiles are outlined after a click on its row. */
    highlightedFieldId: string | null;
    setHighlightedFieldId: (fieldId: string | null) => void;
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
    cancel: () => void;
    /** Keeps the edits; saving stays with the dashboard's own Save. */
    apply: () => void;
    isDirty: boolean;
    /** The parameter control being edited, or null. */
    editingControl: DashboardParameterControl | null;
    /** The edited parameter control was just created and is not applied yet. */
    isNewControl: boolean;
    openControl: (controlId: string) => void;
    /** Turns the placeholder into a parameter control on the given parameter. */
    addParameterControl: (parameterKey: string) => void;
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

export const useControlsSidebar = (): ControlsSidebarContextValue => {
    const context = useContext(ControlsSidebarContext);
    if (context === null) {
        throw new Error(
            'useControlsSidebar must be used within a ControlsSidebarProvider',
        );
    }
    return context;
};
