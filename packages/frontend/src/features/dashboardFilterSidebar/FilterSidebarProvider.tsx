import { type DashboardFilterRule } from '@lightdash/common';
import {
    useCallback,
    useMemo,
    useState,
    type FC,
    type PropsWithChildren,
} from 'react';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    findFilterRule,
    isFilterRuleDirty,
    replaceFilterRule,
    type FilterSidebarSnapshot,
} from './sidebarState';
import {
    FilterSidebarContext,
    type FilterSidebarContextValue,
    type FilterSidebarSection,
} from './useFilterSidebar';

type SidebarState = {
    filterId: string;
    snapshot: FilterSidebarSnapshot;
};

export const FilterSidebarProvider: FC<PropsWithChildren> = ({ children }) => {
    const dashboardFilters = useDashboardContext((c) => c.dashboardFilters);
    const setDashboardFilters = useDashboardContext(
        (c) => c.setDashboardFilters,
    );
    const haveFiltersChanged = useDashboardContext((c) => c.haveFiltersChanged);
    const setHaveFiltersChanged = useDashboardContext(
        (c) => c.setHaveFiltersChanged,
    );

    const [state, setState] = useState<SidebarState | null>(null);
    const [activeSection, setActiveSection] =
        useState<FilterSidebarSection>('fields');

    const open = useCallback(
        (filterId: string) => {
            setState((current) =>
                current !== null
                    ? current
                    : {
                          filterId,
                          snapshot: { dashboardFilters, haveFiltersChanged },
                      },
            );
        },
        [dashboardFilters, haveFiltersChanged],
    );

    const updateFilter = useCallback(
        (next: DashboardFilterRule) => {
            setDashboardFilters((filters) => replaceFilterRule(filters, next));
            setHaveFiltersChanged(true);
        },
        [setDashboardFilters, setHaveFiltersChanged],
    );

    const cancel = useCallback(() => {
        if (state === null) return;
        setDashboardFilters(state.snapshot.dashboardFilters);
        setHaveFiltersChanged(state.snapshot.haveFiltersChanged);
        setState(null);
        setActiveSection('fields');
    }, [state, setDashboardFilters, setHaveFiltersChanged]);

    const apply = useCallback(() => {
        setState(null);
        setActiveSection('fields');
    }, []);

    const value = useMemo<FilterSidebarContextValue>(
        () => ({
            editing: state === null ? null : { filterId: state.filterId },
            originalFilterRule:
                state === null
                    ? null
                    : findFilterRule(
                          state.snapshot.dashboardFilters,
                          state.filterId,
                      ),
            activeSection,
            setActiveSection,
            open,
            updateFilter,
            cancel,
            apply,
            isDirty:
                state !== null &&
                isFilterRuleDirty(
                    state.snapshot.dashboardFilters,
                    dashboardFilters,
                    state.filterId,
                ),
        }),
        [
            state,
            activeSection,
            open,
            updateFilter,
            cancel,
            apply,
            dashboardFilters,
        ],
    );

    return (
        <FilterSidebarContext.Provider value={value}>
            {children}
        </FilterSidebarContext.Provider>
    );
};
