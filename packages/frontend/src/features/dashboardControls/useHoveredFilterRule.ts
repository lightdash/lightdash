import { type DashboardFilterRule } from '@lightdash/common';
import {
    selectDashboardFilters,
    selectRawTemporaryFilters,
    useDashboardSelector,
} from '../dashboard/store';
import { findFilterRule } from './sidebarState';
import { useControlsSidebarSelector } from './useControlsSidebar';

/** The rail row hovered or focused, unless it is the filter being edited. */
export const useHoveredFilterRule = (): DashboardFilterRule | null => {
    const filterId = useControlsSidebarSelector((c) =>
        c.hoveredFilterId === (c.editing?.filterId ?? null)
            ? null
            : c.hoveredFilterId,
    );
    const dashboardFilters = useDashboardSelector(selectDashboardFilters);
    // A viewer's rail lists their own filters too
    const temporaryFilters = useDashboardSelector(selectRawTemporaryFilters);
    return filterId === null
        ? null
        : (findFilterRule(dashboardFilters, filterId) ??
              findFilterRule(temporaryFilters, filterId));
};
