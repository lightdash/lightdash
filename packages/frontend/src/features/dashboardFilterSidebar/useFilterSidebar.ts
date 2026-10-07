import {
    type DashboardFieldTarget,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type ParameterValue,
} from '@lightdash/common';
import { createContext, useContext } from 'react';
import { type ParameterControl } from './parameterControls';
import { type FilterSessionSettings } from './sessionSettings';

export type FilterSidebarSection = 'fields' | 'interactivity';

export type FilterSidebarContextValue = {
    editing: { filterId: string | null } | null;
    isNew: boolean;
    /** The edited filter has no field yet (kind first, or fields cleared). */
    isUnplaced: boolean;
    /** Session filters with no field yet, shown as Not saved pills. */
    unplacedFilters: DashboardFilterRule[];
    clearFields: () => void;
    originalFilterRule: DashboardFilterRule | null;
    editingRule: DashboardFilterRule | null;
    waitingField: DashboardFieldTarget | null;
    setWaitingField: (field: DashboardFieldTarget | null) => void;
    highlightedFieldId: string | null;
    setHighlightedFieldId: (fieldId: string | null) => void;
    hoveredFieldId: string | null;
    setHoveredFieldId: (fieldId: string | null) => void;
    /** Hovered field wins over the locked (clicked) one. */
    activeFieldId: string | null;
    listedFieldIds: string[];
    listFieldId: (fieldId: string) => void;
    unlistFieldId: (fieldId: string) => void;
    activeSection: FilterSidebarSection;
    setActiveSection: (section: FilterSidebarSection) => void;
    open: (filterId: string) => void;
    openNew: () => void;
    addFirstField: (field: DashboardFilterableField) => void;
    removeFilter: () => void;
    removeFilterById: (filterId: string) => void;
    updateFilter: (next: DashboardFilterRule) => void;
    getSessionSettings: (filterId: string) => FilterSessionSettings;
    updateSessionSettings: (
        filterId: string,
        patch: Partial<FilterSessionSettings>,
    ) => void;
    cancel: () => void;
    apply: () => void;
    isDirty: boolean;
    /** Session controls, one per saved parameter value until authored. */
    parameterControls: ParameterControl[];
    editingControlId: string | null;
    isSidebarOpen: boolean;
    newTileUuids: string[];
    dismissedLinks: string[];
    dismissLink: (tileUuid: string, ruleId: string) => void;
    openControl: (id: string) => void;
    /** Adds the control and opens it. */
    addControl: (control: ParameterControl) => void;
    updateControl: (
        id: string,
        patch: Partial<Omit<ParameterControl, 'id'>>,
    ) => void;
    removeControl: (id: string) => void;
    /** Writes the value to every parameter of the control. */
    setControlValue: (id: string, value: ParameterValue | null) => void;
    closeControl: () => void;
    /** Restores the control and its parameter values as they were on open. */
    cancelControl: () => void;
};

export const FilterSidebarContext =
    createContext<FilterSidebarContextValue | null>(null);

export const useFilterSidebar = (): FilterSidebarContextValue => {
    const context = useContext(FilterSidebarContext);
    if (context === null) {
        throw new Error(
            'useFilterSidebar must be used within a FilterSidebarProvider',
        );
    }
    return context;
};
