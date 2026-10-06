import { type DashboardFilterRule } from '@lightdash/common';
import { createContext, useContext } from 'react';

export type FilterSidebarSection = 'fields' | 'interactivity';

export type FilterSidebarContextValue = {
    editing: { filterId: string } | null;
    originalFilterRule: DashboardFilterRule | null;
    activeSection: FilterSidebarSection;
    setActiveSection: (section: FilterSidebarSection) => void;
    open: (filterId: string) => void;
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
