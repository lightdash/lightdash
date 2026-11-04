import {
    FeatureFlags,
    getUnmetFilterRequirements,
    type ExportContentRequest,
    type ParametersValuesMap,
} from '@lightdash/common';
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
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import useDashboardTileStatusContext from '../../../providers/Dashboard/useDashboardTileStatusContext';
import {
    excludeLockedFilterRequirements,
    isLockedDashboardFilterRule,
} from '../../dashboardFilters/lockedFilters';
import { DashboardStoreContext } from './context';
import { selectActiveTabUuid } from './dashboardEditSelectors';
import {
    selectDashboard,
    selectTemporaryFilterLocks,
} from './dashboardSourceSelectors';
import { getTileDashboardParameterInputs } from './parameterControls';
import {
    combineDashboardFilters,
    getSafeTemporaryFilters,
    selectDashboardFilters,
    selectParameterControlInputs,
    selectRawTemporaryFilters,
    selectTileParameterReferences,
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
    const temporaryFilterLocks = useDashboardSelector(
        selectTemporaryFilterLocks,
    );
    const activeTabUuid = useDashboardSelector(selectActiveTabUuid);
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
    const temporaryFilterLocks = useDashboardSelector(
        selectTemporaryFilterLocks,
    );
    const activeTabUuid = useDashboardSelector(selectActiveTabUuid);
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
    // Through the context view, so a SettledFilterFields override applies here too
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

/** True once every chart tile shown on the active tab reported loaded */
export const useAreAllChartsLoaded = () => {
    const chartTileUuidsToLoad = useDashboardTileStatusContext(
        (c) => c.chartTileUuidsToLoad,
    );
    return useDashboardSelector(
        (state) =>
            chartTileUuidsToLoad !== undefined &&
            chartTileUuidsToLoad.every((tileUuid) =>
                state.tileStatus.loadedTiles.has(tileUuid),
            ),
    );
};

/** Screenshot progress for the export page; re-renders on every tile report */
export const useScreenshotReadiness = () => {
    const expectedScreenshotTileUuids = useDashboardTileStatusContext(
        (c) => c.expectedScreenshotTileUuids,
    );
    const hasDashboardTiles = useDashboardTileStatusContext(
        (c) => c.hasDashboardTiles,
    );
    const screenshotReadyTiles = useDashboardSelector(
        (state) => state.tileStatus.screenshotReadyTiles,
    );
    const screenshotErroredTiles = useDashboardSelector(
        (state) => state.tileStatus.screenshotErroredTiles,
    );
    return useMemo(
        () => ({
            isReadyForScreenshot:
                expectedScreenshotTileUuids.length === 0
                    ? hasDashboardTiles
                    : expectedScreenshotTileUuids.every(
                          (tileUuid) =>
                              screenshotReadyTiles.has(tileUuid) ||
                              screenshotErroredTiles.has(tileUuid),
                      ),
            screenshotReadyTilesCount: screenshotReadyTiles.size,
            screenshotErroredTilesCount: screenshotErroredTiles.size,
            expectedScreenshotTilesCount: expectedScreenshotTileUuids.length,
            expectedScreenshotTileUuids,
            screenshotReadyTileUuids: Array.from(screenshotReadyTiles),
            screenshotErroredTileUuids: Array.from(screenshotErroredTiles),
        }),
        [
            expectedScreenshotTileUuids,
            hasDashboardTiles,
            screenshotReadyTiles,
            screenshotErroredTiles,
        ],
    );
};

const NO_TILE_PARAMETER_REFERENCES: Record<string, string[]> = {};
const selectControlledTileParameterReferences = (
    state: Parameters<typeof selectTileParameterReferences>[0],
) =>
    selectParameterControlInputs(state) === null
        ? NO_TILE_PARAMETER_REFERENCES
        : selectTileParameterReferences(state);

const readExportTileParameters = (
    dashboardUuid: string | undefined,
): ExportContentRequest['tileParameters'] => {
    if (!dashboardUuid) return undefined;
    try {
        const saved = sessionStorage.getItem(
            `dashboardExportTileParameters:${dashboardUuid}`,
        );
        if (saved === null) return undefined;
        const parsed: unknown = JSON.parse(saved);
        if (
            typeof parsed !== 'object' ||
            parsed === null ||
            Array.isArray(parsed)
        )
            return undefined;
        const entries = Object.entries(parsed);
        if (
            !entries.every(([, value]) => {
                if (
                    typeof value !== 'object' ||
                    value === null ||
                    Array.isArray(value) ||
                    !('parameters' in value) ||
                    !('excludedParameterKeys' in value)
                )
                    return false;
                const { parameters, excludedParameterKeys } = value;
                return (
                    typeof parameters === 'object' &&
                    parameters !== null &&
                    !Array.isArray(parameters) &&
                    Object.values(parameters).every(
                        (item) =>
                            typeof item === 'string' ||
                            typeof item === 'number' ||
                            (Array.isArray(item) &&
                                item.every(
                                    (element: unknown) =>
                                        typeof element === 'string' ||
                                        typeof element === 'number',
                                )),
                    ) &&
                    Array.isArray(excludedParameterKeys) &&
                    excludedParameterKeys.every(
                        (key: unknown) => typeof key === 'string',
                    )
                );
            })
        )
            return undefined;
        return Object.fromEntries(entries) as NonNullable<
            ExportContentRequest['tileParameters']
        >;
    } catch {
        return undefined;
    }
};

/** One tile's dashboard parameter values, from its parameter controls (draft included) when the flag is on */
export const useTileDashboardParameterInputs = (
    tileUuid: string,
    dashboardValues: ParametersValuesMap,
) => {
    const controlInputs = useDashboardSelector(selectParameterControlInputs);
    const dashboardUuid = useDashboardSelector(
        (state) => selectDashboard(state)?.uuid,
    );
    const { data: dashboardControlsFlag } = useServerFeatureFlag(
        FeatureFlags.DashboardControls,
    );
    const exportTileParameters = useMemo(
        () =>
            dashboardControlsFlag?.enabled === true
                ? readExportTileParameters(dashboardUuid)
                : undefined,
        [dashboardControlsFlag?.enabled, dashboardUuid],
    );
    // Without controls references don't count, so tiles don't re-render when any tile reports them
    const tileParameterReferences = useDashboardSelector(
        selectControlledTileParameterReferences,
    );
    return useMemo(() => {
        const exportInputs =
            exportTileParameters &&
            Object.hasOwn(exportTileParameters, tileUuid)
                ? exportTileParameters[tileUuid]
                : undefined;
        if (exportInputs)
            return {
                dashboardValues: exportInputs.parameters,
                excludedKeys: exportInputs.excludedParameterKeys,
                excludedParameterKeys: exportInputs.excludedParameterKeys,
            };
        const inputs = getTileDashboardParameterInputs({
            controlInputs,
            tileUuid,
            tileParameterReferences,
            dashboardValues,
        });
        return {
            ...inputs,
            // Sent with the values so the server uses this resolution as is; absent without controls
            excludedParameterKeys:
                controlInputs === null ? undefined : inputs.excludedKeys,
        };
    }, [
        controlInputs,
        tileUuid,
        tileParameterReferences,
        dashboardValues,
        exportTileParameters,
    ]);
};
