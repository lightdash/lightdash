import {
    type DashboardFieldTarget,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import { createContext, useContext } from 'react';
import { type FilterSessionSettings } from './sessionSettings';

export type FilterSidebarSection = 'fields' | 'interactivity';

export type FilterSidebarContextValue = {
    editing: { filterId: string | null } | null;
    isNew: boolean;
    // True after every field was removed from an existing filter
    isEmpty: boolean;
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
    backToPicker: () => void;
    apply: () => void;
    isDirty: boolean;
    /** Key of the parameter shown in the sidebar; null while a filter is being edited. */
    parameterKey: string | null;
    openParameter: (key: string) => void;
    closeParameter: () => void;
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
