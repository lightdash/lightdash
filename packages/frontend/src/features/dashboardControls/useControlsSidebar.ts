import { type DashboardFilterRule } from '@lightdash/common';
import {
    createContext,
    useContext,
    useContextSelector,
} from 'use-context-selector';

export type ControlsSidebarContextValue = {
    /** The filter control being edited, or null when the sidebar is closed. */
    editing: { filterId: string } | null;
    editingRule: DashboardFilterRule | null;
    isSidebarOpen: boolean;
    open: (filterId: string) => void;
    updateFilter: (next: DashboardFilterRule) => void;
    /** Removes the edited filter and closes the sidebar. */
    removeFilter: () => void;
    removeFilterById: (filterId: string) => void;
    /** Restores the dashboard filters as they were when the sidebar opened. */
    discard: () => void;
    /**
     * Closes and keeps the edits; saving stays with the dashboard's own Save.
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
