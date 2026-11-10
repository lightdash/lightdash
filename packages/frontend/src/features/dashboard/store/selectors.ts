import {
    getMissingRequiredDashboardParameters,
    getDashboardTileParameterOverrides,
    omitDisallowedParameterValues,
    reconcileDashboardControlOrder,
    isReservedParameterName,
    stripOverridesForLockedFiltersOnTab,
    type DashboardFilters,
    type ParametersValuesMap,
    type SortField,
} from '@lightdash/common';
import { createSelector } from '@reduxjs/toolkit';
import { type DashboardStoreState } from '.';
import { applyParameterLabelOverrides } from '../../../providers/Dashboard/parameterLabelOverrides';
import { getEffectiveControlOrder } from '../../dashboardControls/sections';
import {
    selectControlOrder,
    selectControlSections,
} from './dashboardEditSelectors';
import {
    getParameterControlInputs,
    getDashboardParameterOptionValues,
    getTileDashboardParameterInputs,
} from './parameterControls';

export type TemporaryFilterLocks = {
    /** Saved filters of the query-loaded dashboard (embeds have none) */
    savedFilters: DashboardFilters;
    hasTabs: boolean;
};

// Filters
export const selectDashboardFilters = (state: DashboardStoreState) =>
    state.filters.dashboardFilters;
export const selectRawTemporaryFilters = (state: DashboardStoreState) =>
    state.filters.temporaryFilters;
export const selectHaveFiltersChanged = (state: DashboardStoreState) =>
    state.filters.haveFiltersChanged;
export const selectSavedFilterOverrides = (state: DashboardStoreState) =>
    state.filters.savedFilterOverrides;

/**
 * Strips temporary filters that conflict with a filter locked on the active
 * tab. Derived at read time so they reappear on tabs where nothing is locked.
 */
export const getSafeTemporaryFilters = (
    temporaryFilters: DashboardFilters,
    locks: TemporaryFilterLocks | undefined,
    activeTabUuid: string | undefined,
): { filters: DashboardFilters; droppedCount: number } =>
    locks
        ? stripOverridesForLockedFiltersOnTab(
              locks.savedFilters,
              temporaryFilters,
              activeTabUuid,
              locks.hasTabs,
          )
        : { filters: temporaryFilters, droppedCount: 0 };

export const combineDashboardFilters = (
    dashboardFilters: DashboardFilters,
    temporaryFilters: DashboardFilters,
): DashboardFilters => ({
    dimensions: [
        ...dashboardFilters.dimensions,
        ...temporaryFilters.dimensions,
    ],
    metrics: [...dashboardFilters.metrics, ...temporaryFilters.metrics],
    tableCalculations: [
        ...dashboardFilters.tableCalculations,
        ...temporaryFilters.tableCalculations,
    ],
});

// Parameters
export const selectSavedParameters = (state: DashboardStoreState) =>
    state.parameters.savedParameters;
export const selectDashboardParameters = (state: DashboardStoreState) =>
    state.parameters.parameters;
export const selectParametersHaveChanged = (state: DashboardStoreState) =>
    state.parameters.parametersHaveChanged;
export const selectPinnedParameters = (state: DashboardStoreState) =>
    state.parameters.pinnedParameters;
export const selectHavePinnedParametersChanged = (state: DashboardStoreState) =>
    state.parameters.havePinnedParametersChanged;
export const selectParameterOrder = (state: DashboardStoreState) =>
    state.parameters.parameterOrder;
export const selectHasParameterOrderChanged = (state: DashboardStoreState) =>
    state.parameters.hasParameterOrderChanged;
export const selectTileParameterReferences = (state: DashboardStoreState) =>
    state.parameters.tileParameterReferences;
const selectTileChartSavedParameters = (state: DashboardStoreState) =>
    state.parameters.tileChartSavedParameters;
const selectTileVirtualViewSavedParameters = (state: DashboardStoreState) =>
    state.parameters.tileVirtualViewSavedParameters;
const selectRawParameterDefinitions = (state: DashboardStoreState) =>
    state.parameters.parameterDefinitions;
const selectParameterLabelOverrides = (state: DashboardStoreState) =>
    state.parameters.parameterLabelOverrides;

/** Applied values, without empty ones */
export const selectParameterValues = createSelector(
    [selectDashboardParameters],
    (parameters) =>
        Object.entries(parameters).reduce<ParametersValuesMap>(
            (acc, [key, parameter]) => {
                if (
                    parameter.value !== null &&
                    parameter.value !== undefined &&
                    parameter.value !== ''
                ) {
                    acc[key] = parameter.value;
                }
                return acc;
            },
            {},
        ),
);

const selectSavedParameterValues = createSelector(
    [selectSavedParameters],
    (savedParameters): ParametersValuesMap =>
        Object.fromEntries(
            Object.entries(savedParameters).map(([key, parameter]) => [
                key,
                parameter.value,
            ]),
        ),
);

/** Tile queries run with the saved values under the current ones, so labels must too */
export const selectAppliedParameterValues = createSelector(
    [selectSavedParameterValues, selectParameterValues],
    (savedParameterValues, parameterValues): ParametersValuesMap => ({
        ...savedParameterValues,
        ...parameterValues,
    }),
);

export const selectDashboardParameterDefinitions = createSelector(
    [selectRawParameterDefinitions, selectParameterLabelOverrides],
    (parameterDefinitions, parameterLabelOverrides) =>
        applyParameterLabelOverrides(
            parameterDefinitions,
            parameterLabelOverrides,
        ),
);

export const selectDashboardParameterReferences = createSelector(
    [selectTileParameterReferences],
    (tileParameterReferences) =>
        new Set(Object.values(tileParameterReferences).flat()),
);

const selectTileQueryParameterReferences = (state: DashboardStoreState) =>
    state.parameters.tileQueryParameterReferences;

export const selectParameterPicks = (state: DashboardStoreState) =>
    state.parameters.parameterPicks;
export const selectParameterControls = (state: DashboardStoreState) =>
    state.parameters.parameterControls;
export const selectAreParameterControlsSaved = (state: DashboardStoreState) =>
    state.parameters.areParameterControlsSaved;
export const selectHaveParameterControlsChanged = (
    state: DashboardStoreState,
) => state.parameters.haveParameterControlsChanged;

export const selectParameterControlPicks = (state: DashboardStoreState) =>
    state.parameters.parameterControlPicks;
export const selectParameterTilePicks = (state: DashboardStoreState) =>
    state.parameters.parameterTilePicks;

/**
 * Null with the dashboard-controls flag off, and while the list is only filled
 * from the tiles and unchanged; tiles then take the dashboard-wide values,
 * which a filled list would equal once the tiles have reported.
 */
export const selectParameterControlInputs = createSelector(
    [
        selectParameterControls,
        selectParameterPicks,
        selectAreParameterControlsSaved,
        selectHaveParameterControlsChanged,
        selectRawParameterDefinitions,
        selectParameterControlPicks,
        selectParameterTilePicks,
    ],
    (
        parameterControls,
        parameterPicks,
        areControlsSaved,
        haveControlsChanged,
        parameterDefinitions,
        controlPicks,
        tilePicks,
    ) =>
        parameterControls === null ||
        (!areControlsSaved &&
            !haveControlsChanged &&
            Object.keys(controlPicks).length === 0 &&
            Object.keys(tilePicks).length === 0)
            ? null
            : getParameterControlInputs(
                  parameterControls,
                  parameterPicks,
                  // Loaded definitions are the user's: project and model parameters
                  Object.keys(parameterDefinitions),
                  controlPicks,
                  tilePicks,
              ),
);

/**
 * Values for dashboard-wide requests (exports, deliveries). Backend treats each
 * as an outside value beating a control's own, so with saved controls only the
 * picks go; the legacy path takes the full map, which replaces saved values.
 */
export const selectDashboardWideParameterValues = createSelector(
    [
        selectParameterValues,
        selectParameterControlInputs,
        selectAreParameterControlsSaved,
    ],
    (parameterValues, controlInputs, areControlsSaved): ParametersValuesMap =>
        controlInputs !== null && areControlsSaved
            ? controlInputs.overrides
            : parameterValues,
);

/**
 * The values the dashboard runs with by key, for showing them (the scheduler
 * form): with saved controls, each key's control value with the picks on top.
 */
export const selectDashboardEffectiveParameterValues = createSelector(
    [selectParameterValues, selectParameterControlInputs],
    (parameterValues, controlInputs): ParametersValuesMap =>
        getDashboardParameterOptionValues(controlInputs, parameterValues),
);

export const selectMissingRequiredParameters = createSelector(
    [
        selectTileParameterReferences,
        selectTileQueryParameterReferences,
        selectTileChartSavedParameters,
        selectTileVirtualViewSavedParameters,
        selectAppliedParameterValues,
        selectDashboardParameterDefinitions,
        selectParameterControlInputs,
    ],
    (
        tileParameterReferences,
        tileQueryParameterReferences,
        tileChartSavedParameters,
        tileVirtualViewSavedParameters,
        appliedParameterValues,
        parameterDefinitions,
        controlInputs,
    ) =>
        getMissingRequiredDashboardParameters({
            // A tile's saved values arrive when it runs; until then it can't count as missing
            tiles: Object.entries(tileParameterReferences)
                .filter(
                    ([tileUuid]) => tileUuid in tileQueryParameterReferences,
                )
                .map(([tileUuid, parameterReferences]) => ({
                    parameterReferences,
                    chartSavedValues: tileChartSavedParameters[tileUuid] ?? {},
                    virtualViewSavedValues:
                        tileVirtualViewSavedParameters[tileUuid] ?? {},
                    ...getTileDashboardParameterInputs({
                        controlInputs,
                        tileUuid,
                        tileParameterReferences,
                        dashboardValues: appliedParameterValues,
                    }),
                })),
            definitions: parameterDefinitions,
        }),
);

export const selectMissingParametersByTile = createSelector(
    [
        selectTileParameterReferences,
        selectTileQueryParameterReferences,
        selectTileChartSavedParameters,
        selectTileVirtualViewSavedParameters,
        selectAppliedParameterValues,
        selectDashboardParameterDefinitions,
        selectParameterControlInputs,
    ],
    (
        references,
        queryReferences,
        chartValues,
        virtualValues,
        dashboardValues,
        definitions,
        controlInputs,
    ) =>
        Object.fromEntries(
            Object.entries(references)
                .filter(([tileUuid]) =>
                    Object.hasOwn(queryReferences, tileUuid),
                )
                .map(([tileUuid, parameterReferences]) => {
                    const inputs = {
                        chartSavedValues: chartValues[tileUuid] ?? {},
                        virtualViewSavedValues: virtualValues[tileUuid] ?? {},
                        ...getTileDashboardParameterInputs({
                            controlInputs,
                            tileUuid,
                            tileParameterReferences: references,
                            dashboardValues,
                        }),
                    };
                    const missing = getMissingRequiredDashboardParameters({
                        tiles: [{ parameterReferences, ...inputs }],
                        definitions,
                    });
                    const overrides = getDashboardTileParameterOverrides({
                        ...inputs,
                        definitions,
                    });
                    const virtual = omitDisallowedParameterValues(
                        inputs.virtualViewSavedValues,
                        definitions,
                    );
                    for (const key of new Set(parameterReferences)) {
                        if (
                            isReservedParameterName(key) &&
                            Object.hasOwn(definitions, key) &&
                            overrides[key] === undefined &&
                            definitions[key]?.default === undefined &&
                            virtual[key] === undefined
                        )
                            missing.push(key);
                    }
                    return [tileUuid, missing];
                }),
        ),
);

// Date zoom
export const selectDateZoomGranularity = (state: DashboardStoreState) =>
    state.dateZoom.granularity;
export const selectControlGranularities = (state: DashboardStoreState) =>
    state.dateZoom.controlGranularities;
export const selectChartZoomableFieldsByTileUuid = (
    state: DashboardStoreState,
) => state.dateZoom.chartZoomableFieldsByTileUuid;
export const selectTilesWithDateZoomApplied = (state: DashboardStoreState) =>
    state.dateZoom.tilesWithDateZoomApplied;
export const selectIsDateZoomAppliedToTile = (
    state: DashboardStoreState,
    tileUuid: string,
) => !!state.dateZoom.tilesWithDateZoomApplied?.has(tileUuid);

// Chart sort
const noSorts: SortField[] = [];
/** Stable empty list for unsorted tiles, so their query inputs keep identity */
export const selectTileChartSorts = (
    state: DashboardStoreState,
    tileUuid: string,
) => state.chartSort.sortsByTileUuid[tileUuid] ?? noSorts;

// Tile status
export const selectInvalidateCache = (state: DashboardStoreState) =>
    state.tileStatus.invalidateCache;
export const selectRefreshCounter = (state: DashboardStoreState) =>
    state.tileStatus.refreshCounter;
export const selectIsAutoRefresh = (state: DashboardStoreState) =>
    state.tileStatus.isAutoRefresh;
export const selectOldestCacheTime = (state: DashboardStoreState) =>
    state.tileStatus.oldestCacheTime;
export const selectSqlChartTilesMetadata = (state: DashboardStoreState) =>
    state.tileStatus.sqlChartTilesMetadata;
export const selectAvailableCustomGranularities = (
    state: DashboardStoreState,
) => state.tileStatus.availableCustomGranularities;
export const selectCompletedEmbedTiles = (state: DashboardStoreState) =>
    state.tileStatus.completedEmbedTiles;

/** Every control in bar order: the stored order (none when absent or empty), else the default bar */
export const selectOrderedControls = createSelector(
    [
        selectControlOrder,
        selectDashboardFilters,
        selectParameterControls,
        selectAreParameterControlsSaved,
        selectControlSections,
    ],
    (controlOrder, filters, parameterControls, areSaved, sections) =>
        reconcileDashboardControlOrder({
            controlOrder: getEffectiveControlOrder(
                controlOrder,
                parameterControls,
                areSaved,
            ),
            filters,
            parameterControls: parameterControls ?? [],
            sections,
        }),
);

/** Whether the bar follows a stored order rather than the default */
export const selectHasStoredControlOrder = (state: DashboardStoreState) =>
    (selectControlOrder(state)?.length ?? 0) > 0;
