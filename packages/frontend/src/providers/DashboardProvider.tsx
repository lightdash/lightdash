import {
    ApiError,
    CacheMetadata,
    compressDashboardFiltersToParam,
    convertDashboardFiltersParamToDashboardFilters,
    Dashboard,
    DashboardFilterRule,
    DashboardFilters,
    fieldId,
    FilterableField,
    isDashboardChartTileType,
} from '@lightdash/common';
import { min } from 'lodash-es';
import React, {
    Dispatch,
    SetStateAction,
    useCallback,
    useEffect,
    useMemo,
    useState,
} from 'react';
import { useHistory, useLocation, useParams } from 'react-router-dom';
import { useMount } from 'react-use';
import { createContext, useContextSelector } from 'use-context-selector';
import { FieldsWithSuggestions } from '../components/common/Filters/FiltersProvider';
import { isFilterConfigRevertButtonEnabled as hasSavedFilterValueChanged } from '../components/DashboardFilter/FilterConfiguration/utils';
import {
    useDashboardQuery,
    useDashboardsAvailableFilters,
} from '../hooks/dashboard/useDashboard';
import {
    applyDimensionOverrides,
    hasSavedFiltersOverrides,
    useSavedDashboardFiltersOverrides,
} from '../hooks/useSavedDashboardFiltersOverrides';

const emptyFilters: DashboardFilters = {
    dimensions: [],
    metrics: [],
};

type DashboardContext = {
    dashboard: Dashboard | undefined;
    dashboardError: ApiError | null;
    dashboardTiles: Dashboard['tiles'] | undefined;
    setDashboardTiles: Dispatch<SetStateAction<Dashboard['tiles'] | undefined>>;
    haveTilesChanged: boolean;
    setHaveTilesChanged: Dispatch<SetStateAction<boolean>>;
    dashboardFilters: DashboardFilters;
    dashboardTemporaryFilters: DashboardFilters;
    allFilters: DashboardFilters;
    isLoadingDashboardFilters: boolean;
    isFetchingDashboardFilters: boolean;
    setDashboardFilters: Dispatch<SetStateAction<DashboardFilters>>;
    setDashboardTemporaryFilters: Dispatch<SetStateAction<DashboardFilters>>;
    addDimensionDashboardFilter: (
        filter: DashboardFilterRule,
        isTemporary: boolean,
    ) => void;
    updateDimensionDashboardFilter: (
        filter: DashboardFilterRule,
        index: number,
        isTemporary: boolean,
    ) => void;
    removeDimensionDashboardFilter: (
        index: number,
        isTemporary: boolean,
    ) => void;
    addMetricDashboardFilter: (
        filter: DashboardFilterRule,
        isTemporary: boolean,
    ) => void;
    haveFiltersChanged: boolean;
    setHaveFiltersChanged: Dispatch<SetStateAction<boolean>>;
    addResultsCacheTime: (cacheMetadata: CacheMetadata) => void;
    oldestCacheTime: Date | undefined;
    invalidateCache: boolean | undefined;
    clearCacheAndFetch: () => void;
    fieldsWithSuggestions: FieldsWithSuggestions;
    allFilterableFields: FilterableField[] | undefined;
    filterableFieldsByTileUuid: Record<string, FilterableField[]> | undefined;
    hasChartTiles: boolean;
};

const Context = createContext<DashboardContext | undefined>(undefined);

export const DashboardProvider: React.FC = ({ children }) => {
    const { search, pathname } = useLocation();
    const history = useHistory();

    const { dashboardUuid } = useParams<{
        dashboardUuid: string;
    }>();

    const { data: dashboard, error: dashboardError } =
        useDashboardQuery(dashboardUuid);
    const [dashboardTiles, setDashboardTiles] = useState<Dashboard['tiles']>();

    const [haveTilesChanged, setHaveTilesChanged] = useState<boolean>(false);
    const [dashboardTemporaryFilters, setDashboardTemporaryFilters] =
        useState<DashboardFilters>(emptyFilters);
    const [dashboardFilters, setDashboardFilters] =
        useState<DashboardFilters>(emptyFilters);
    const [originalDashboardFilters, setOriginalDashboardFilters] =
        useState<DashboardFilters>(emptyFilters);
    const [haveFiltersChanged, setHaveFiltersChanged] =
        useState<boolean>(false);
    const [resultsCacheTimes, setResultsCacheTimes] = useState<Date[]>([]);

    const [invalidateCache, setInvalidateCache] = useState<boolean>(false);

    const {
        overridesForSavedDashboardFilters,
        addSavedFilterOverride,

        removeSavedFilterOverride,
    } = useSavedDashboardFiltersOverrides();

    const tileSavedChartUuids = useMemo(
        () =>
            dashboardTiles
                ?.filter(isDashboardChartTileType)
                .map((tile) => tile.properties.savedChartUuid)
                .filter((uuid): uuid is string => !!uuid),
        [dashboardTiles],
    );

    useEffect(() => {
        if (dashboard) {
            if (dashboardFilters === emptyFilters) {
                let updatedDashboardFilters;

                if (
                    hasSavedFiltersOverrides(overridesForSavedDashboardFilters)
                ) {
                    updatedDashboardFilters = {
                        ...dashboard.filters,
                        dimensions: applyDimensionOverrides(
                            dashboard.filters,
                            overridesForSavedDashboardFilters,
                        ),
                    };
                } else {
                    updatedDashboardFilters = dashboard.filters;
                }

                setDashboardFilters(updatedDashboardFilters);
                setHaveFiltersChanged(false);
            }

            setOriginalDashboardFilters(dashboard.filters);
        }
    }, [dashboard, dashboardFilters, overridesForSavedDashboardFilters]);

    // Updates url with temp filters
    useEffect(() => {
        const newParams = new URLSearchParams(search);
        if (
            dashboardTemporaryFilters?.dimensions?.length === 0 &&
            dashboardTemporaryFilters?.metrics?.length === 0
        ) {
            newParams.delete('tempFilters');
        } else {
            newParams.set(
                'tempFilters',
                JSON.stringify(
                    compressDashboardFiltersToParam(dashboardTemporaryFilters),
                ),
            );
        }

        if (overridesForSavedDashboardFilters?.dimensions?.length === 0) {
            newParams.delete('filters');
        } else if (overridesForSavedDashboardFilters?.dimensions?.length > 0) {
            newParams.set(
                'filters',
                JSON.stringify(
                    compressDashboardFiltersToParam(
                        overridesForSavedDashboardFilters,
                    ),
                ),
            );
        }

        history.replace({
            pathname,
            search: newParams.toString(),
        });
    }, [
        dashboardFilters,
        dashboardTemporaryFilters,
        history,
        pathname,
        overridesForSavedDashboardFilters,
        search,
    ]);

    useEffect(() => {
        if (
            dashboard?.filters &&
            hasSavedFiltersOverrides(overridesForSavedDashboardFilters)
        ) {
            setDashboardFilters({
                ...dashboard.filters,
                dimensions: applyDimensionOverrides(
                    dashboard.filters,
                    overridesForSavedDashboardFilters,
                ),
            });
        }
    }, [dashboard?.filters, overridesForSavedDashboardFilters]);

    // Gets filters from URL and storage after redirect
    useMount(() => {
        const searchParams = new URLSearchParams(search);
        const tempFilterSearchParam = searchParams.get('tempFilters');
        const unsavedDashboardFiltersRaw = sessionStorage.getItem(
            'unsavedDashboardFilters',
        );

        sessionStorage.removeItem('unsavedDashboardFilters');
        if (unsavedDashboardFiltersRaw) {
            const unsavedDashboardFilters = JSON.parse(
                unsavedDashboardFiltersRaw,
            );
            // TODO: this should probably merge with the filters
            // from the database. This will break if they diverge,
            // meaning there is a subtle race condition here
            setDashboardFilters(unsavedDashboardFilters);
        }
        if (tempFilterSearchParam) {
            setDashboardTemporaryFilters(
                convertDashboardFiltersParamToDashboardFilters(
                    JSON.parse(tempFilterSearchParam),
                ),
            );
        }
    });

    const {
        isLoading: isLoadingDashboardFilters,
        isFetching: isFetchingDashboardFilters,
        data: dashboardAvailableFiltersData,
    } = useDashboardsAvailableFilters(tileSavedChartUuids ?? []);

    const filterableFieldsByTileUuid = useMemo(() => {
        if (!dashboard || !dashboardTiles || !dashboardAvailableFiltersData)
            return;

        //! TODO: add tile uuid to the payload!
        const tileFilters: Record<string, FilterableField[] | undefined> = {};
        Object.entries(dashboardAvailableFiltersData.savedQueryFilters).forEach(
            ([tileUuid, indexes]) => {
                tileFilters[tileUuid] = indexes.map(
                    (index) =>
                        dashboardAvailableFiltersData.allFilterableFields[
                            index
                        ],
                );
            },
        );

        return dashboardTiles
            .filter(isDashboardChartTileType)
            .reduce<DashboardContext['filterableFieldsByTileUuid']>(
                (acc, tile) => {
                    const savedChartUuid = tile.properties.savedChartUuid;
                    if (!savedChartUuid) return acc;

                    const filterFields = tileFilters[savedChartUuid];
                    if (filterFields && acc) {
                        acc[tile.uuid] = filterFields;
                    }
                    return acc;
                },
                {},
            );
    }, [dashboard, dashboardTiles, dashboardAvailableFiltersData]);

    const fieldsWithSuggestions = useMemo(() => {
        return dashboardAvailableFiltersData &&
            dashboardAvailableFiltersData.allFilterableFields &&
            dashboardAvailableFiltersData.allFilterableFields.length > 0
            ? dashboardAvailableFiltersData.allFilterableFields.reduce<FieldsWithSuggestions>(
                  (sum, field) => ({
                      ...sum,
                      [fieldId(field)]: field,
                  }),
                  {},
              )
            : {};
    }, [dashboardAvailableFiltersData]);

    const allFilters = useMemo(() => {
        return {
            dimensions: [
                ...dashboardFilters.dimensions,
                ...dashboardTemporaryFilters?.dimensions,
            ],
            metrics: [
                ...dashboardFilters.metrics,
                ...dashboardTemporaryFilters?.metrics,
            ],
        };
    }, [dashboardFilters, dashboardTemporaryFilters]);

    const hasChartTiles = useMemo(
        () =>
            Boolean(
                dashboardTiles &&
                    dashboardTiles.filter(isDashboardChartTileType).length >= 1,
            ),
        [dashboardTiles],
    );

    const addDimensionDashboardFilter = useCallback(
        (filter: DashboardFilterRule, isTemporary: boolean) => {
            const setFunction = isTemporary
                ? setDashboardTemporaryFilters
                : setDashboardFilters;
            setFunction((previousFilters) => ({
                dimensions: [...previousFilters.dimensions, filter],
                metrics: previousFilters.metrics,
            }));
            setHaveFiltersChanged(true);
        },
        [setDashboardFilters],
    );

    const updateDimensionDashboardFilter = useCallback(
        (item: DashboardFilterRule, index: number, isTemporary: boolean) => {
            const setFunction = isTemporary
                ? setDashboardTemporaryFilters
                : setDashboardFilters;

            setFunction((previousFilters) => {
                if (!isTemporary) {
                    const hasChanged = hasSavedFilterValueChanged(
                        previousFilters.dimensions[index],
                        item,
                    );

                    const isReverted =
                        originalDashboardFilters.dimensions[index] &&
                        !hasSavedFilterValueChanged(
                            originalDashboardFilters.dimensions[index],
                            item,
                        );

                    if (hasChanged) {
                        addSavedFilterOverride(item);
                    }

                    if (isReverted) {
                        removeSavedFilterOverride(item);
                    }
                }

                return {
                    dimensions: [
                        ...previousFilters.dimensions.slice(0, index),
                        item,
                        ...previousFilters.dimensions.slice(index + 1),
                    ],
                    metrics: previousFilters.metrics,
                };
            });
            setHaveFiltersChanged(true);
        },
        [
            addSavedFilterOverride,
            originalDashboardFilters.dimensions,
            removeSavedFilterOverride,
        ],
    );

    const addMetricDashboardFilter = useCallback(
        (filter, isTemporary: boolean) => {
            const setFunction = isTemporary
                ? setDashboardTemporaryFilters
                : setDashboardFilters;
            setFunction((previousFilters) => ({
                dimensions: previousFilters.dimensions,
                metrics: [...previousFilters.metrics, filter],
            }));
            setHaveFiltersChanged(true);
        },
        [],
    );

    const removeDimensionDashboardFilter = useCallback(
        (index: number, isTemporary: boolean) => {
            const setFunction = isTemporary
                ? setDashboardTemporaryFilters
                : setDashboardFilters;
            setFunction((previousFilters) => {
                if (!isTemporary) {
                    removeSavedFilterOverride(
                        previousFilters.dimensions[index],
                    );
                }
                return {
                    dimensions: [
                        ...previousFilters.dimensions.slice(0, index),
                        ...previousFilters.dimensions.slice(index + 1),
                    ],
                    metrics: previousFilters.metrics,
                };
            });
            setHaveFiltersChanged(true);
        },
        [removeSavedFilterOverride],
    );

    const addResultsCacheTime = useCallback((cacheMetadata: CacheMetadata) => {
        if (cacheMetadata.cacheHit && cacheMetadata.cacheUpdatedTime) {
            setResultsCacheTimes((old) =>
                cacheMetadata.cacheUpdatedTime
                    ? [...old, cacheMetadata.cacheUpdatedTime]
                    : [...old],
            );
        }
    }, []);

    const clearCacheAndFetch = useCallback(() => {
        setResultsCacheTimes([]);

        // Causes results refetch
        setInvalidateCache(true);
    }, []);

    const oldestCacheTime = useMemo(
        () => min(resultsCacheTimes),
        [resultsCacheTimes],
    );

    const value = {
        dashboard,
        dashboardError,
        dashboardTiles,
        setDashboardTiles,
        haveTilesChanged,
        setHaveTilesChanged,
        setDashboardTemporaryFilters,
        dashboardFilters,
        dashboardTemporaryFilters,
        addDimensionDashboardFilter,
        updateDimensionDashboardFilter,
        removeDimensionDashboardFilter,
        addMetricDashboardFilter,
        setDashboardFilters,
        haveFiltersChanged,
        setHaveFiltersChanged,
        addResultsCacheTime,
        oldestCacheTime,
        invalidateCache,
        clearCacheAndFetch,
        fieldsWithSuggestions,
        allFilterableFields: dashboardAvailableFiltersData?.allFilterableFields,
        isLoadingDashboardFilters,
        isFetchingDashboardFilters,
        filterableFieldsByTileUuid,
        allFilters,
        hasChartTiles,
    };
    return <Context.Provider value={value}>{children}</Context.Provider>;
};

export function useDashboardContext<Selected>(
    selector: (value: DashboardContext) => Selected,
) {
    return useContextSelector(Context, (context) => {
        if (context === undefined) {
            throw new Error(
                'useDashboardContext must be used within a DashboardProvider',
            );
        }
        return selector(context);
    });
}
