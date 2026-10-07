import {
    type DashboardFilterableField,
    type DashboardFilterRule,
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
    updateFilter: (next: DashboardFilterRule) => void;
    /** Removes the edited filter and closes the sidebar. */
    removeFilter: () => void;
    removeFilterById: (filterId: string) => void;
    /** Restores the dashboard filters as they were when the sidebar opened. */
    cancel: () => void;
    /** Keeps the edits; saving stays with the dashboard's own Save. */
    apply: () => void;
    isDirty: boolean;
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
