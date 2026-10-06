import {
    type DashboardFieldTarget,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import { createContext, useContext } from 'react';

export type FilterSidebarSection = 'fields' | 'interactivity';

export type FilterSidebarContextValue = {
    editing: { filterId: string | null } | null;
    isNew: boolean;
    originalFilterRule: DashboardFilterRule | null;
    editingRule: DashboardFilterRule | null;
    waitingField: DashboardFieldTarget | null;
    setWaitingField: (field: DashboardFieldTarget | null) => void;
    highlightedFieldId: string | null;
    setHighlightedFieldId: (fieldId: string | null) => void;
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
    cancel: () => void;
    apply: () => void;
    isDirty: boolean;
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
