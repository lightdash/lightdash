import { getUnmetFilterRequirements } from '@lightdash/common';
// FIXES ts2742 issue with useDispatch and useSelector
// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
import type * as rtk from '@reduxjs/toolkit';
import { useMemo } from 'react';
import {
    createDispatchHook,
    createSelectorHook,
    createStoreHook,
} from 'react-redux';
import {
    type DashboardStore,
    type DashboardStoreDispatch,
    type DashboardStoreState,
} from '.';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import {
    excludeLockedFilterRequirements,
    isLockedDashboardFilterRule,
} from '../../dashboardFilters/lockedFilters';
import { DashboardStoreContext } from './context';
import {
    combineDashboardFilters,
    getSafeTemporaryFilters,
    selectDashboardFilters,
    selectRawTemporaryFilters,
} from './selectors';

// NOTE: Use these for dashboard state instead of plain `useDispatch` and `useSelector`
export const useDashboardDispatch = createDispatchHook(
    DashboardStoreContext,
).withTypes<DashboardStoreDispatch>();
export const useDashboardSelector = createSelectorHook(
    DashboardStoreContext,
).withTypes<DashboardStoreState>();
/** Reads state inside callbacks without subscribing to it */
export const useDashboardStore = createStoreHook(
    DashboardStoreContext,
).withTypes<DashboardStore>();

/** Temporary filters minus those that conflict with a filter locked on the active tab */
export const useDashboardTemporaryFilters = () => {
    const temporaryFilters = useDashboardSelector(selectRawTemporaryFilters);
    const temporaryFilterLocks = useDashboardContext(
        (c) => c.temporaryFilterLocks,
    );
    const activeTabUuid = useDashboardContext((c) => c.activeTab?.uuid);
    return useMemo(
        () =>
            getSafeTemporaryFilters(
                temporaryFilters,
                temporaryFilterLocks,
                activeTabUuid,
            ).filters,
        [temporaryFilters, temporaryFilterLocks, activeTabUuid],
    );
};

/** Subscribes to the boolean only, so callers re-render when it flips */
export const useHasDashboardTemporaryFilters = () => {
    const temporaryFilterLocks = useDashboardContext(
        (c) => c.temporaryFilterLocks,
    );
    const activeTabUuid = useDashboardContext((c) => c.activeTab?.uuid);
    return useDashboardSelector((state) => {
        const { filters } = getSafeTemporaryFilters(
            selectRawTemporaryFilters(state),
            temporaryFilterLocks,
            activeTabUuid,
        );
        return filters.dimensions.length > 0 || filters.metrics.length > 0;
    });
};

/** Saved (possibly overridden) filters plus the effective temporary filters */
export const useDashboardAllFilters = () => {
    const dashboardFilters = useDashboardSelector(selectDashboardFilters);
    const temporaryFilters = useDashboardTemporaryFilters();
    return useMemo(
        () => combineDashboardFilters(dashboardFilters, temporaryFilters),
        [dashboardFilters, temporaryFilters],
    );
};

export const useDashboardUnmetFilterRequirements = () => {
    const dashboardFilters = useDashboardSelector(selectDashboardFilters);
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const hiddenFilterableFieldIds = useDashboardContext(
        (c) => c.hiddenFilterableFieldIds,
    );
    return useMemo(
        () =>
            excludeLockedFilterRequirements(
                getUnmetFilterRequirements(dashboardFilters),
                (filterRule) =>
                    isLockedDashboardFilterRule(filterRule, {
                        filterableFieldsByTileUuid,
                        hiddenFilterableFieldIds,
                    }),
            ),
        [
            dashboardFilters,
            filterableFieldsByTileUuid,
            hiddenFilterableFieldIds,
        ],
    );
};
