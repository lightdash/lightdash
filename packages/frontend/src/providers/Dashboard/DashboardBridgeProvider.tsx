import {
    DashboardTileTypes,
    getItemId,
    isDashboardChartTileType,
    type CacheMetadata,
    type Dashboard,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardFilters,
    type DashboardParameters,
    type DateGranularity,
    type FilterableDimension,
    type InteractivityOptions,
    type Metric,
    type ParameterDefinitions,
    type ParametersValuesMap,
    type ParameterValue,
    type SortField,
} from '@lightdash/common';
import React, { useCallback, useMemo, type MutableRefObject } from 'react';
import { getConditionalRuleLabelFromItem } from '../../components/common/Filters/FilterInputs/utils';
import { type useDashboardCommentsCheck } from '../../features/comments';
import { hasSavedFilterValueChanged } from '../../features/dashboardFilters/FilterConfiguration/utils';
import DashboardContext from './context';
import { dashboardDataActions } from './store/dashboardDataSlice';
import {
    dashboardFiltersActions,
    EMPTY_FILTERS,
} from './store/dashboardFiltersSlice';
import { useDashboardDispatch, useDashboardSelector } from './store/hooks';
import DashboardTileStatusContext from './tileStatusContext';
import { type SqlChartTileMetadata } from './types';

type DerivedData = {
    allFilters: DashboardFilters;
    filterableFieldsByTileUuid:
        | Record<string, DashboardFilterableField[]>
        | undefined;
    dashboardAvailableFiltersData:
        | {
              allFilterableFields: FilterableDimension[];
              allFilterableMetrics: Metric[];
              savedQueryFilters: Record<string, number[]>;
              savedQueryMetricFilters: Record<string, number[]>;
          }
        | undefined;
    overridesForSavedDashboardFilters: DashboardFilters;
    addSavedFilterOverride: (
        filter: DashboardFilterRule,
        type?: 'metrics',
    ) => void;
    removeSavedFilterOverride: (
        filter: DashboardFilterRule,
        type?: 'metrics',
    ) => void;
    resetSavedFilterOverrides: () => void;
    applyInteractivityFiltering: (
        filters: DashboardFilters,
    ) => DashboardFilters;
    versionRefresh: (
        dashboard: Dashboard | undefined,
    ) => Promise<Dashboard | null>;
    missingRequiredParameters: string[];
    expectedScreenshotTileUuids: string[];
    areAllChartsLoaded: boolean;
    dashboardParameterReferences: Set<string>;
    parameterValues: ParametersValuesMap;
    selectedParametersCount: number;
    dashboard: Dashboard | undefined;
    originalDashboardFilters: DashboardFilters;
};

type Props = {
    children: React.ReactNode;
    derivedDataRef: MutableRefObject<DerivedData>;
    dashboardCommentsCheck?: ReturnType<typeof useDashboardCommentsCheck>;
};

/**
 * Bridge component that reads all values from the Redux store
 * and provides them via the existing DashboardContext.
 * This allows consumers to keep using useDashboardContext unchanged.
 */
export const DashboardBridgeProvider: React.FC<Props> = ({
    children,
    derivedDataRef,
    dashboardCommentsCheck,
}) => {
    const dispatch = useDashboardDispatch();

    // Read from Redux
    const projectUuid = useDashboardSelector(
        (s) => s.dashboardData.projectUuid,
    );
    const isDashboardLoading = useDashboardSelector(
        (s) => s.dashboardData.isDashboardLoading,
    );
    const dashboardError = useDashboardSelector(
        (s) => s.dashboardData.dashboardError,
    );
    const dashboardTiles = useDashboardSelector(
        (s) => s.dashboardData.dashboardTiles,
    );
    const haveTilesChanged = useDashboardSelector(
        (s) => s.dashboardData.haveTilesChanged,
    );
    const haveTabsChanged = useDashboardSelector(
        (s) => s.dashboardData.haveTabsChanged,
    );
    const dashboardTabs = useDashboardSelector(
        (s) => s.dashboardData.dashboardTabs,
    );
    const activeTab = useDashboardSelector((s) => s.dashboardData.activeTab);
    const isAutoRefresh = useDashboardSelector(
        (s) => s.dashboardData.isAutoRefresh,
    );
    const oldestCacheTime = useDashboardSelector(
        (s) => s.dashboardData.oldestCacheTime,
    );
    const invalidateCache = useDashboardSelector(
        (s) => s.dashboardData.invalidateCache,
    );
    const chartSort = useDashboardSelector((s) => s.dashboardData.chartSort);
    const sqlChartTilesMetadata = useDashboardSelector(
        (s) => s.dashboardData.sqlChartTilesMetadata,
    );
    const dateZoomGranularity = useDashboardSelector(
        (s) => s.dashboardData.dateZoomGranularity,
    );
    const chartsWithDateZoomApplied = useDashboardSelector(
        (s) => s.dashboardData.chartsWithDateZoomApplied,
    );
    const dashboardComments = useDashboardSelector(
        (s) => s.dashboardData.dashboardComments,
    );
    const isDateZoomDisabled = useDashboardSelector(
        (s) => s.dashboardData.isDateZoomDisabled,
    );
    const isAddFilterDisabled = useDashboardSelector(
        (s) => s.dashboardData.isAddFilterDisabled,
    );
    const parametersHaveChanged = useDashboardSelector(
        (s) => s.dashboardData.parametersHaveChanged,
    );
    const parameters = useDashboardSelector((s) => s.dashboardData.parameters);
    const savedParameters = useDashboardSelector(
        (s) => s.dashboardData.savedParameters,
    );
    const parameterDefinitions = useDashboardSelector(
        (s) => s.dashboardData.parameterDefinitions,
    );
    const tileParameterReferences = useDashboardSelector(
        (s) => s.dashboardData.tileParameterReferences,
    );
    const pinnedParameters = useDashboardSelector(
        (s) => s.dashboardData.pinnedParameters,
    );
    const havePinnedParametersChanged = useDashboardSelector(
        (s) => s.dashboardData.havePinnedParametersChanged,
    );
    const dashboardHasTimestampDimension = useDashboardSelector(
        (s) => s.dashboardData.tilesWithTimestampDimension.size > 0,
    );
    const availableCustomGranularities = useDashboardSelector(
        (s) => s.dashboardData.availableCustomGranularities,
    );
    const dateZoomGranularities = useDashboardSelector(
        (s) => s.dashboardData.dateZoomGranularities,
    );
    const haveDateZoomGranularitiesChanged = useDashboardSelector(
        (s) => s.dashboardData.haveDateZoomGranularitiesChanged,
    );
    const defaultDateZoomGranularity = useDashboardSelector(
        (s) => s.dashboardData.defaultDateZoomGranularity,
    );
    const hasDefaultDateZoomGranularityChanged = useDashboardSelector(
        (s) => s.dashboardData.hasDefaultDateZoomGranularityChanged,
    );
    const preAggregateStatuses = useDashboardSelector(
        (s) => s.dashboardData.preAggregateStatuses,
    );
    const isRefreshingDashboardVersion = useDashboardSelector(
        (s) => s.dashboardData.isRefreshingDashboardVersion,
    );
    const screenshotReadyTiles = useDashboardSelector(
        (s) => s.dashboardData.screenshotReadyTiles,
    );
    const screenshotErroredTiles = useDashboardSelector(
        (s) => s.dashboardData.screenshotErroredTiles,
    );
    const embedDashboard = useDashboardSelector(
        (s) => s.dashboardData.embedDashboard,
    );
    const dashboardFilters = useDashboardSelector(
        (s) => s.dashboardFilters.dashboardFilters,
    );
    const dashboardTemporaryFilters = useDashboardSelector(
        (s) => s.dashboardFilters.dashboardTemporaryFilters,
    );
    const haveFiltersChanged = useDashboardSelector(
        (s) => s.dashboardFilters.haveFiltersChanged,
    );
    const isLoadingDashboardFilters = useDashboardSelector(
        (s) => s.dashboardData.isLoadingDashboardFilters,
    );
    const isFetchingDashboardFilters = useDashboardSelector(
        (s) => s.dashboardData.isFetchingDashboardFilters,
    );

    // Derived data from ref
    const {
        allFilters,
        filterableFieldsByTileUuid,
        dashboardAvailableFiltersData,
        overridesForSavedDashboardFilters: _overridesForSavedDashboardFilters,
        addSavedFilterOverride,
        removeSavedFilterOverride,
        resetSavedFilterOverrides,
        applyInteractivityFiltering,
        versionRefresh,
        missingRequiredParameters,
        expectedScreenshotTileUuids,
        areAllChartsLoaded,
        dashboardParameterReferences,
        parameterValues,
        selectedParametersCount,
        dashboard: resolvedDashboard,
        originalDashboardFilters,
    } = derivedDataRef.current;

    // Computed values
    const allFilterableFieldsMap = useMemo(() => {
        if (!dashboardAvailableFiltersData?.allFilterableFields?.length)
            return {};
        return dashboardAvailableFiltersData.allFilterableFields.reduce<
            Record<string, FilterableDimension>
        >(
            (sum, field) => ({
                ...sum,
                [getItemId(field)]: field,
            }),
            {},
        );
    }, [dashboardAvailableFiltersData]);

    const allFilterableMetricsMap = useMemo(() => {
        if (!dashboardAvailableFiltersData?.allFilterableMetrics?.length)
            return {};
        return dashboardAvailableFiltersData.allFilterableMetrics.reduce<
            Record<string, Metric>
        >(
            (sum, field) => ({
                ...sum,
                [getItemId(field)]: field,
            }),
            {},
        );
    }, [dashboardAvailableFiltersData]);

    const hasTilesThatSupportFilters = useMemo(() => {
        const tileTypesThatSupportFilters = [
            DashboardTileTypes.SQL_CHART,
            DashboardTileTypes.SAVED_CHART,
        ];
        return !!dashboardTiles?.some(({ type }) =>
            tileTypesThatSupportFilters.includes(type),
        );
    }, [dashboardTiles]);

    const tileNamesById = useMemo(() => {
        if (!dashboardTiles) return {};
        return dashboardTiles.reduce<Record<string, string>>((acc, tile) => {
            const tileWithoutTitle =
                !tile.properties.title || tile.properties.title.length === 0;
            const isChartTileType = isDashboardChartTileType(tile);
            let tileName = '';
            if (tileWithoutTitle && isChartTileType) {
                tileName = tile.properties.chartName || '';
            } else if (tile.properties.title) {
                tileName = tile.properties.title;
            }
            acc[tile.uuid] = tileName;
            return acc;
        }, {});
    }, [dashboardTiles]);

    const tileTabsById = useMemo(() => {
        if (!dashboardTiles) return {};
        return dashboardTiles.reduce<Record<string, string | null | undefined>>(
            (acc, tile) => {
                acc[tile.uuid] = tile.tabUuid;
                return acc;
            },
            {},
        );
    }, [dashboardTiles]);

    const requiredDashboardFilters = useMemo(
        () =>
            [...dashboardFilters.dimensions, ...dashboardFilters.metrics]
                .filter((f) => f.required && f.disabled)
                .reduce<Pick<DashboardFilterRule, 'id' | 'label'>[]>(
                    (acc, f) => {
                        const field =
                            allFilterableFieldsMap[f.target.fieldId] ??
                            allFilterableMetricsMap[f.target.fieldId];
                        let label = '';
                        if (f.label) {
                            label = f.label;
                        } else if (field) {
                            label = getConditionalRuleLabelFromItem(
                                f,
                                field,
                            ).field;
                        }
                        return [...acc, { id: f.id, label }];
                    },
                    [],
                ),
        [
            dashboardFilters.dimensions,
            dashboardFilters.metrics,
            allFilterableFieldsMap,
            allFilterableMetricsMap,
        ],
    );

    const isReadyForScreenshot = useMemo(() => {
        if (expectedScreenshotTileUuids.length === 0) {
            return !!dashboardTiles;
        }
        return expectedScreenshotTileUuids.every(
            (tileUuid) =>
                screenshotReadyTiles.has(tileUuid) ||
                screenshotErroredTiles.has(tileUuid),
        );
    }, [
        expectedScreenshotTileUuids,
        screenshotReadyTiles,
        screenshotErroredTiles,
        dashboardTiles,
    ]);

    // Dispatch wrappers that match the DashboardContextType signatures
    const hasTileComments = useCallback(
        (tileUuid: string) =>
            !!(
                dashboardComments &&
                dashboardComments[tileUuid] &&
                dashboardComments[tileUuid].length > 0
            ),
        [dashboardComments],
    );

    const setEmbedDashboard = useCallback(
        (
            value:
                | ((Dashboard & InteractivityOptions) | undefined)
                | ((
                      prev: (Dashboard & InteractivityOptions) | undefined,
                  ) => (Dashboard & InteractivityOptions) | undefined),
        ) => {
            if (typeof value === 'function') {
                // For function updates, we need to read current state
                // This is a simplification - the set state action pattern
                const result = value(embedDashboard);
                dispatch(dashboardDataActions.setEmbedDashboard(result));
            } else {
                dispatch(dashboardDataActions.setEmbedDashboard(value));
            }
        },
        [dispatch, embedDashboard],
    );

    const setDashboardTiles = useCallback(
        (
            value:
                | (Dashboard['tiles'] | undefined)
                | ((
                      prev: Dashboard['tiles'] | undefined,
                  ) => Dashboard['tiles'] | undefined),
        ) => {
            if (typeof value === 'function') {
                const result = value(dashboardTiles);
                dispatch(dashboardDataActions.setDashboardTiles(result));
            } else {
                dispatch(dashboardDataActions.setDashboardTiles(value));
            }
        },
        [dispatch, dashboardTiles],
    );

    const setHaveTilesChanged = useCallback(
        (value: boolean | ((prev: boolean) => boolean)) => {
            const resolved =
                typeof value === 'function' ? value(haveTilesChanged) : value;
            dispatch(dashboardDataActions.setHaveTilesChanged(resolved));
        },
        [dispatch, haveTilesChanged],
    );

    const setHaveTabsChanged = useCallback(
        (value: boolean | ((prev: boolean) => boolean)) => {
            const resolved =
                typeof value === 'function' ? value(haveTabsChanged) : value;
            dispatch(dashboardDataActions.setHaveTabsChanged(resolved));
        },
        [dispatch, haveTabsChanged],
    );

    const setDashboardTabs = useCallback(
        (
            value:
                | Dashboard['tabs']
                | ((prev: Dashboard['tabs']) => Dashboard['tabs']),
        ) => {
            if (typeof value === 'function') {
                const result = value(dashboardTabs);
                dispatch(
                    dashboardDataActions.setDashboardTabs(
                        [...result].sort((a, b) => a.order - b.order),
                    ),
                );
            } else {
                dispatch(
                    dashboardDataActions.setDashboardTabs(
                        [...value].sort((a, b) => a.order - b.order),
                    ),
                );
            }
        },
        [dispatch, dashboardTabs],
    );

    const setActiveTab = useCallback(
        (
            value:
                | (Dashboard['tabs'][number] | undefined)
                | ((
                      prev: Dashboard['tabs'][number] | undefined,
                  ) => Dashboard['tabs'][number] | undefined),
        ) => {
            if (typeof value === 'function') {
                const result = value(activeTab);
                dispatch(dashboardDataActions.setActiveTab(result));
            } else {
                dispatch(dashboardDataActions.setActiveTab(value));
            }
        },
        [dispatch, activeTab],
    );

    const setDashboardFilters = useCallback(
        (
            value:
                | DashboardFilters
                | ((prev: DashboardFilters) => DashboardFilters),
        ) => {
            if (typeof value === 'function') {
                const result = value(dashboardFilters);
                dispatch(dashboardFiltersActions.setDashboardFilters(result));
            } else {
                dispatch(dashboardFiltersActions.setDashboardFilters(value));
            }
        },
        [dispatch, dashboardFilters],
    );

    const setDashboardTemporaryFilters = useCallback(
        (
            value:
                | DashboardFilters
                | ((prev: DashboardFilters) => DashboardFilters),
        ) => {
            if (typeof value === 'function') {
                const result = value(dashboardTemporaryFilters);
                dispatch(
                    dashboardFiltersActions.setDashboardTemporaryFilters(
                        result,
                    ),
                );
            } else {
                dispatch(
                    dashboardFiltersActions.setDashboardTemporaryFilters(value),
                );
            }
        },
        [dispatch, dashboardTemporaryFilters],
    );

    const setHaveFiltersChanged = useCallback(
        (value: boolean | ((prev: boolean) => boolean)) => {
            const resolved =
                typeof value === 'function' ? value(haveFiltersChanged) : value;
            dispatch(dashboardFiltersActions.setHaveFiltersChanged(resolved));
        },
        [dispatch, haveFiltersChanged],
    );

    const addDimensionDashboardFilter = useCallback(
        (filter: DashboardFilterRule, isTemporary: boolean) => {
            dispatch(
                dashboardFiltersActions.addDimensionDashboardFilter({
                    filter,
                    isTemporary,
                }),
            );
        },
        [dispatch],
    );

    const updateDimensionDashboardFilter = useCallback(
        (
            item: DashboardFilterRule,
            index: number,
            isTemporary: boolean,
            isInEditMode: boolean,
        ) => {
            // Handle saved filter override side effects
            if (!isTemporary) {
                const filters = resolvedDashboard?.filters?.dimensions || [];
                const isFilterSaved = filters.some(({ id }) => id === item.id);

                if (isInEditMode) {
                    removeSavedFilterOverride(item);
                } else {
                    const isReverted =
                        originalDashboardFilters.dimensions[index] &&
                        !hasSavedFilterValueChanged(
                            originalDashboardFilters.dimensions[index],
                            item,
                        );
                    if (isReverted) {
                        removeSavedFilterOverride(item);
                        dispatch(
                            dashboardFiltersActions.setHaveFiltersChanged(
                                false,
                            ),
                        );
                    } else {
                        const hasChanged = hasSavedFilterValueChanged(
                            dashboardFilters.dimensions[index],
                            item,
                        );
                        if (hasChanged && isFilterSaved) {
                            addSavedFilterOverride(item);
                        }
                    }
                }
            }
            dispatch(
                dashboardFiltersActions.updateDimensionDashboardFilter({
                    filter: item,
                    index,
                    isTemporary,
                }),
            );
        },
        [
            dispatch,
            addSavedFilterOverride,
            resolvedDashboard?.filters?.dimensions,
            originalDashboardFilters.dimensions,
            dashboardFilters.dimensions,
            removeSavedFilterOverride,
        ],
    );

    const removeDimensionDashboardFilter = useCallback(
        (index: number, isTemporary: boolean) => {
            if (!isTemporary) {
                removeSavedFilterOverride(dashboardFilters.dimensions[index]);
            }
            dispatch(
                dashboardFiltersActions.removeDimensionDashboardFilter({
                    index,
                    isTemporary,
                }),
            );
        },
        [dispatch, removeSavedFilterOverride, dashboardFilters.dimensions],
    );

    const addMetricDashboardFilter = useCallback(
        (filter: DashboardFilterRule, isTemporary: boolean) => {
            dispatch(
                dashboardFiltersActions.addMetricDashboardFilter({
                    filter,
                    isTemporary,
                }),
            );
        },
        [dispatch],
    );

    const updateMetricDashboardFilter = useCallback(
        (
            item: DashboardFilterRule,
            index: number,
            isTemporary: boolean,
            isInEditMode: boolean,
        ) => {
            if (!isTemporary) {
                const filters = resolvedDashboard?.filters?.metrics || [];
                const isFilterSaved = filters.some(({ id }) => id === item.id);

                if (isInEditMode) {
                    removeSavedFilterOverride(item, 'metrics');
                } else {
                    const isReverted =
                        originalDashboardFilters.metrics[index] &&
                        !hasSavedFilterValueChanged(
                            originalDashboardFilters.metrics[index],
                            item,
                        );
                    if (isReverted) {
                        removeSavedFilterOverride(item, 'metrics');
                        dispatch(
                            dashboardFiltersActions.setHaveFiltersChanged(
                                false,
                            ),
                        );
                    } else {
                        const hasChanged = hasSavedFilterValueChanged(
                            dashboardFilters.metrics[index],
                            item,
                        );
                        if (hasChanged && isFilterSaved) {
                            addSavedFilterOverride(item, 'metrics');
                        }
                    }
                }
            }
            dispatch(
                dashboardFiltersActions.updateMetricDashboardFilter({
                    filter: item,
                    index,
                    isTemporary,
                }),
            );
        },
        [
            dispatch,
            addSavedFilterOverride,
            resolvedDashboard?.filters?.metrics,
            originalDashboardFilters.metrics,
            dashboardFilters.metrics,
            removeSavedFilterOverride,
        ],
    );

    const removeMetricDashboardFilter = useCallback(
        (index: number, isTemporary: boolean) => {
            if (!isTemporary) {
                removeSavedFilterOverride(
                    dashboardFilters.metrics[index],
                    'metrics',
                );
            }
            dispatch(
                dashboardFiltersActions.removeMetricDashboardFilter({
                    index,
                    isTemporary,
                }),
            );
        },
        [dispatch, removeSavedFilterOverride, dashboardFilters.metrics],
    );

    const resetDashboardFilters = useCallback(() => {
        const filters = resolvedDashboard?.filters ?? EMPTY_FILTERS;
        const filteredFilters = embedDashboard
            ? applyInteractivityFiltering(filters)
            : filters;
        dispatch(
            dashboardFiltersActions.resetDashboardFilters(filteredFilters),
        );
        resetSavedFilterOverrides();
    }, [
        dispatch,
        resolvedDashboard?.filters,
        embedDashboard,
        applyInteractivityFiltering,
        resetSavedFilterOverrides,
    ]);

    const addResultsCacheTime = useCallback(
        (cacheMetadata?: CacheMetadata) => {
            dispatch(dashboardDataActions.addResultsCacheTime(cacheMetadata));
        },
        [dispatch],
    );

    const clearCacheAndFetch = useCallback(() => {
        dispatch(dashboardDataActions.clearCacheAndFetch());
    }, [dispatch]);

    const markTileLoaded = useCallback(
        (tileUuid: string) => {
            dispatch(dashboardDataActions.markTileLoaded(tileUuid));
        },
        [dispatch],
    );

    const setIsAutoRefresh = useCallback(
        (autoRefresh: boolean) => {
            dispatch(dashboardDataActions.setIsAutoRefresh(autoRefresh));
        },
        [dispatch],
    );

    const setChartSort = useCallback(
        (sort: Record<string, SortField[]>) => {
            dispatch(dashboardDataActions.setChartSort(sort));
        },
        [dispatch],
    );

    const updateSqlChartTilesMetadata = useCallback(
        (tileUuid: string, metadata: SqlChartTileMetadata) => {
            dispatch(
                dashboardDataActions.updateSqlChartTilesMetadata({
                    tileUuid,
                    metadata,
                }),
            );
        },
        [dispatch],
    );

    const setDateZoomGranularity = useCallback(
        (
            value:
                | (DateGranularity | string | undefined)
                | ((
                      prev: DateGranularity | string | undefined,
                  ) => DateGranularity | string | undefined),
        ) => {
            if (typeof value === 'function') {
                const result = value(dateZoomGranularity);
                dispatch(dashboardDataActions.setDateZoomGranularity(result));
            } else {
                dispatch(dashboardDataActions.setDateZoomGranularity(value));
            }
        },
        [dispatch, dateZoomGranularity],
    );

    const setChartsWithDateZoomApplied = useCallback(
        (
            value:
                | (Set<string> | undefined)
                | ((prev: Set<string> | undefined) => Set<string> | undefined),
        ) => {
            if (typeof value === 'function') {
                const result = value(chartsWithDateZoomApplied);
                dispatch(
                    dashboardDataActions.setChartsWithDateZoomApplied(result),
                );
            } else {
                dispatch(
                    dashboardDataActions.setChartsWithDateZoomApplied(value),
                );
            }
        },
        [dispatch, chartsWithDateZoomApplied],
    );

    const setIsDateZoomDisabled = useCallback(
        (value: boolean | ((prev: boolean) => boolean)) => {
            const resolved =
                typeof value === 'function' ? value(isDateZoomDisabled) : value;
            dispatch(dashboardDataActions.setIsDateZoomDisabled(resolved));
        },
        [dispatch, isDateZoomDisabled],
    );

    const setIsAddFilterDisabled = useCallback(
        (value: boolean | ((prev: boolean) => boolean)) => {
            const resolved =
                typeof value === 'function'
                    ? value(isAddFilterDisabled)
                    : value;
            dispatch(dashboardDataActions.setIsAddFilterDisabled(resolved));
        },
        [dispatch, isAddFilterDisabled],
    );

    const setSavedParameters = useCallback(
        (
            value:
                | DashboardParameters
                | ((prev: DashboardParameters) => DashboardParameters),
        ) => {
            if (typeof value === 'function') {
                const result = value(savedParameters);
                dispatch(dashboardDataActions.setSavedParameters(result));
            } else {
                dispatch(dashboardDataActions.setSavedParameters(value));
            }
        },
        [dispatch, savedParameters],
    );

    const setParameter = useCallback(
        (key: string, value: ParameterValue | null) => {
            dispatch(dashboardDataActions.setParameter({ key, value }));
        },
        [dispatch],
    );

    const clearAllParameters = useCallback(() => {
        dispatch(dashboardDataActions.clearAllParameters());
    }, [dispatch]);

    const addParameterReferences = useCallback(
        (tileUuid: string, references: string[]) => {
            dispatch(
                dashboardDataActions.addParameterReferences({
                    tileUuid,
                    references,
                }),
            );
        },
        [dispatch],
    );

    const addParameterDefinitions = useCallback(
        (params: ParameterDefinitions) => {
            dispatch(dashboardDataActions.addParameterDefinitions(params));
        },
        [dispatch],
    );

    const addAvailableCustomGranularities = useCallback(
        (granularities: Record<string, string>) => {
            dispatch(
                dashboardDataActions.addAvailableCustomGranularities(
                    granularities,
                ),
            );
        },
        [dispatch],
    );

    const setPinnedParameters = useCallback(
        (pinnedParams: string[]) => {
            dispatch(dashboardDataActions.setPinnedParameters(pinnedParams));
        },
        [dispatch],
    );

    const toggleParameterPin = useCallback(
        (parameterKey: string) => {
            dispatch(dashboardDataActions.toggleParameterPin(parameterKey));
        },
        [dispatch],
    );

    const setHavePinnedParametersChanged = useCallback(
        (value: boolean | ((prev: boolean) => boolean)) => {
            const resolved =
                typeof value === 'function'
                    ? value(havePinnedParametersChanged)
                    : value;
            dispatch(
                dashboardDataActions.setHavePinnedParametersChanged(resolved),
            );
        },
        [dispatch, havePinnedParametersChanged],
    );

    const setTileHasTimestampDimension = useCallback(
        (tileUuid: string, hasTimestamp: boolean) => {
            dispatch(
                dashboardDataActions.setTileHasTimestampDimension({
                    tileUuid,
                    hasTimestamp,
                }),
            );
        },
        [dispatch],
    );

    const setDateZoomGranularities = useCallback(
        (granularities: (DateGranularity | string)[]) => {
            dispatch(
                dashboardDataActions.setDateZoomGranularities(granularities),
            );
        },
        [dispatch],
    );

    const setHaveDateZoomGranularitiesChanged = useCallback(
        (value: boolean | ((prev: boolean) => boolean)) => {
            const resolved =
                typeof value === 'function'
                    ? value(haveDateZoomGranularitiesChanged)
                    : value;
            dispatch(
                dashboardDataActions.setHaveDateZoomGranularitiesChanged(
                    resolved,
                ),
            );
        },
        [dispatch, haveDateZoomGranularitiesChanged],
    );

    const setDefaultDateZoomGranularity = useCallback(
        (granularity: DateGranularity | string | undefined) => {
            dispatch(
                dashboardDataActions.setDefaultDateZoomGranularity(granularity),
            );
        },
        [dispatch],
    );

    const setHasDefaultDateZoomGranularityChanged = useCallback(
        (value: boolean | ((prev: boolean) => boolean)) => {
            const resolved =
                typeof value === 'function'
                    ? value(hasDefaultDateZoomGranularityChanged)
                    : value;
            dispatch(
                dashboardDataActions.setHasDefaultDateZoomGranularityChanged(
                    resolved,
                ),
            );
        },
        [dispatch, hasDefaultDateZoomGranularityChanged],
    );

    const addPreAggregateStatus = useCallback(
        (tileUuid: string, cacheMetadata?: CacheMetadata) => {
            const preAggregate = cacheMetadata?.preAggregate ?? null;
            dispatch(
                dashboardDataActions.addPreAggregateStatus({
                    tileUuid,
                    status: {
                        tileUuid,
                        tileName: tileNamesById[tileUuid] ?? tileUuid,
                        hit: preAggregate?.hit ?? false,
                        preAggregateName: preAggregate?.name ?? null,
                        reason: preAggregate?.reason ?? null,
                        hasPreAggregateMetadata: preAggregate !== null,
                        tabUuid: tileTabsById[tileUuid],
                    },
                }),
            );
        },
        [dispatch, tileNamesById, tileTabsById],
    );

    const refreshDashboardVersion = useCallback(async () => {
        try {
            const freshDashboard = await versionRefresh(resolvedDashboard);
            if (freshDashboard) {
                dispatch(
                    dashboardDataActions.setDashboardTiles(
                        freshDashboard.tiles,
                    ),
                );
                dispatch(
                    dashboardDataActions.setDashboardTabs(freshDashboard.tabs),
                );
                dispatch(
                    dashboardDataActions.setSavedParameters(
                        freshDashboard.parameters ?? {},
                    ),
                );
            }
        } catch (error) {
            console.error('Failed to refresh dashboard:', error);
        }
    }, [dispatch, versionRefresh, resolvedDashboard]);

    const markTileScreenshotReady = useCallback(
        (tileUuid: string) => {
            dispatch(dashboardDataActions.markTileScreenshotReady(tileUuid));
        },
        [dispatch],
    );

    const markTileScreenshotErrored = useCallback(
        (tileUuid: string) => {
            dispatch(dashboardDataActions.markTileScreenshotErrored(tileUuid));
        },
        [dispatch],
    );

    const value = useMemo(
        () => ({
            projectUuid,
            isDashboardLoading,
            dashboard: resolvedDashboard,
            setEmbedDashboard,
            dashboardError,
            dashboardTiles,
            setDashboardTiles,
            haveTilesChanged,
            setHaveTilesChanged,
            haveTabsChanged,
            setHaveTabsChanged,
            dashboardTabs,
            setDashboardTabs,
            activeTab,
            setActiveTab,
            setDashboardTemporaryFilters,
            dashboardFilters,
            dashboardTemporaryFilters,
            addDimensionDashboardFilter,
            updateDimensionDashboardFilter,
            removeDimensionDashboardFilter,
            addMetricDashboardFilter,
            updateMetricDashboardFilter,
            removeMetricDashboardFilter,
            resetDashboardFilters,
            setDashboardFilters,
            haveFiltersChanged,
            setHaveFiltersChanged,
            addResultsCacheTime,
            oldestCacheTime,
            invalidateCache,
            clearCacheAndFetch,
            isAutoRefresh,
            setIsAutoRefresh,
            allFilterableFieldsMap,
            allFilterableMetricsMap,
            allFilterableFields:
                dashboardAvailableFiltersData?.allFilterableFields,
            allFilterableMetrics:
                dashboardAvailableFiltersData?.allFilterableMetrics,
            isLoadingDashboardFilters,
            isFetchingDashboardFilters,
            filterableFieldsByTileUuid,
            allFilters,
            hasTilesThatSupportFilters,
            chartSort,
            setChartSort,
            sqlChartTilesMetadata,
            updateSqlChartTilesMetadata,
            dateZoomGranularity,
            setDateZoomGranularity,
            chartsWithDateZoomApplied,
            setChartsWithDateZoomApplied,
            dashboardCommentsCheck,
            dashboardComments,
            hasTileComments,
            requiredDashboardFilters,
            isDateZoomDisabled,
            setIsDateZoomDisabled,
            isAddFilterDisabled,
            setIsAddFilterDisabled,
            setSavedParameters,
            parametersHaveChanged,
            dashboardParameters: parameters,
            parameterValues,
            selectedParametersCount,
            setParameter,
            parameterDefinitions,
            clearAllParameters,
            dashboardParameterReferences,
            addParameterReferences,
            tileParameterReferences,
            areAllChartsLoaded,
            missingRequiredParameters,
            pinnedParameters,
            setPinnedParameters,
            toggleParameterPin,
            havePinnedParametersChanged,
            setHavePinnedParametersChanged,
            dateZoomGranularities,
            setDateZoomGranularities,
            haveDateZoomGranularitiesChanged,
            setHaveDateZoomGranularitiesChanged,
            defaultDateZoomGranularity,
            setDefaultDateZoomGranularity,
            hasDefaultDateZoomGranularityChanged,
            setHasDefaultDateZoomGranularityChanged,
            addParameterDefinitions,
            dashboardHasTimestampDimension,
            setTileHasTimestampDimension,
            availableCustomGranularities,
            addAvailableCustomGranularities,
            tileNamesById,
            preAggregateStatuses,
            addPreAggregateStatus,
            refreshDashboardVersion,
            isRefreshingDashboardVersion,
            markTileScreenshotReady,
            markTileScreenshotErrored,
            isReadyForScreenshot,
            screenshotReadyTilesCount: screenshotReadyTiles.size,
            screenshotErroredTilesCount: screenshotErroredTiles.size,
            expectedScreenshotTilesCount: expectedScreenshotTileUuids.length,
        }),
        [
            projectUuid,
            isDashboardLoading,
            resolvedDashboard,
            setEmbedDashboard,
            dashboardError,
            dashboardTiles,
            setDashboardTiles,
            haveTilesChanged,
            setHaveTilesChanged,
            haveTabsChanged,
            setHaveTabsChanged,
            dashboardTabs,
            setDashboardTabs,
            activeTab,
            setActiveTab,
            setDashboardTemporaryFilters,
            dashboardFilters,
            dashboardTemporaryFilters,
            addDimensionDashboardFilter,
            updateDimensionDashboardFilter,
            removeDimensionDashboardFilter,
            addMetricDashboardFilter,
            updateMetricDashboardFilter,
            removeMetricDashboardFilter,
            resetDashboardFilters,
            setDashboardFilters,
            haveFiltersChanged,
            setHaveFiltersChanged,
            addResultsCacheTime,
            oldestCacheTime,
            invalidateCache,
            clearCacheAndFetch,
            isAutoRefresh,
            setIsAutoRefresh,
            allFilterableFieldsMap,
            allFilterableMetricsMap,
            dashboardAvailableFiltersData,
            isLoadingDashboardFilters,
            isFetchingDashboardFilters,
            filterableFieldsByTileUuid,
            allFilters,
            hasTilesThatSupportFilters,
            chartSort,
            setChartSort,
            sqlChartTilesMetadata,
            updateSqlChartTilesMetadata,
            dateZoomGranularity,
            setDateZoomGranularity,
            chartsWithDateZoomApplied,
            setChartsWithDateZoomApplied,
            dashboardCommentsCheck,
            dashboardComments,
            hasTileComments,
            requiredDashboardFilters,
            isDateZoomDisabled,
            setIsDateZoomDisabled,
            isAddFilterDisabled,
            setIsAddFilterDisabled,
            setSavedParameters,
            parametersHaveChanged,
            parameters,
            parameterValues,
            selectedParametersCount,
            setParameter,
            parameterDefinitions,
            clearAllParameters,
            dashboardParameterReferences,
            addParameterReferences,
            tileParameterReferences,
            areAllChartsLoaded,
            missingRequiredParameters,
            pinnedParameters,
            setPinnedParameters,
            toggleParameterPin,
            havePinnedParametersChanged,
            setHavePinnedParametersChanged,
            dateZoomGranularities,
            setDateZoomGranularities,
            haveDateZoomGranularitiesChanged,
            setHaveDateZoomGranularitiesChanged,
            defaultDateZoomGranularity,
            setDefaultDateZoomGranularity,
            hasDefaultDateZoomGranularityChanged,
            setHasDefaultDateZoomGranularityChanged,
            addParameterDefinitions,
            dashboardHasTimestampDimension,
            setTileHasTimestampDimension,
            availableCustomGranularities,
            addAvailableCustomGranularities,
            tileNamesById,
            preAggregateStatuses,
            addPreAggregateStatus,
            refreshDashboardVersion,
            isRefreshingDashboardVersion,
            markTileScreenshotReady,
            markTileScreenshotErrored,
            isReadyForScreenshot,
            screenshotReadyTiles,
            screenshotErroredTiles,
            expectedScreenshotTileUuids,
        ],
    );

    const tileStatusValue = useMemo(
        () => ({
            oldestCacheTime,
            addResultsCacheTime,
            preAggregateStatuses,
            addPreAggregateStatus,
            invalidateCache,
            isAutoRefresh,
            setIsAutoRefresh,
            clearCacheAndFetch,
            sqlChartTilesMetadata,
            updateSqlChartTilesMetadata,
            markTileLoaded,
            areAllChartsLoaded,
            dashboardHasTimestampDimension,
            setTileHasTimestampDimension,
            availableCustomGranularities,
            addAvailableCustomGranularities,
            tileNamesById,
            markTileScreenshotReady,
            markTileScreenshotErrored,
            isReadyForScreenshot,
            screenshotReadyTilesCount: screenshotReadyTiles.size,
            screenshotErroredTilesCount: screenshotErroredTiles.size,
            expectedScreenshotTilesCount: expectedScreenshotTileUuids.length,
        }),
        [
            oldestCacheTime,
            addResultsCacheTime,
            preAggregateStatuses,
            addPreAggregateStatus,
            invalidateCache,
            isAutoRefresh,
            setIsAutoRefresh,
            clearCacheAndFetch,
            sqlChartTilesMetadata,
            updateSqlChartTilesMetadata,
            markTileLoaded,
            areAllChartsLoaded,
            dashboardHasTimestampDimension,
            setTileHasTimestampDimension,
            availableCustomGranularities,
            addAvailableCustomGranularities,
            tileNamesById,
            markTileScreenshotReady,
            markTileScreenshotErrored,
            isReadyForScreenshot,
            screenshotReadyTiles,
            screenshotErroredTiles,
            expectedScreenshotTileUuids,
        ],
    );

    return (
        <DashboardContext.Provider value={value}>
            <DashboardTileStatusContext.Provider value={tileStatusValue}>
                {children}
            </DashboardTileStatusContext.Provider>
        </DashboardContext.Provider>
    );
};
