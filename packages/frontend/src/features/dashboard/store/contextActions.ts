import {
    type AdditionalMetric,
    type ChartZoomableField,
    type Dashboard,
    type DashboardFilterRule,
    type DashboardFilters,
    type DashboardParameters,
    type DateGranularity,
    type DateZoomConfig,
    type InteractivityOptions,
    type ParameterDefinitions,
    type ParametersValuesMap,
    type ParameterValue,
    type SortField,
} from '@lightdash/common';
import { type Store } from '@reduxjs/toolkit';
import { type SetStateAction } from 'react';
import { type DashboardStoreState } from '.';
import { applyEmbedFilterInteractivity } from '../../../providers/Dashboard/embedFilterInteractivity';
import { dashboardChartSortActions } from './dashboardChartSortReducer';
import { dashboardDateZoomActions } from './dashboardDateZoomReducer';
import {
    dashboardEditActions,
    getSavedDateZoomSettings,
} from './dashboardEditReducer';
import {
    selectActiveTab,
    selectDashboardCustomMetrics,
    selectDashboardTabs,
    selectDashboardTiles,
    selectDateZoomConfig,
    selectEditedRequiredFiltersNote,
    selectHasDateZoomConfigChanged,
    selectHasDefaultDateZoomGranularityChanged,
    selectHaveCustomMetricsChanged,
    selectHaveDateZoomGranularitiesChanged,
    selectHaveTabsChanged,
    selectHaveTilesChanged,
    selectIsAddFilterDisabled,
    selectIsDateZoomDisabled,
} from './dashboardEditSelectors';
import {
    dashboardFiltersActions,
    emptyDashboardFilters,
} from './dashboardFiltersReducer';
import { dashboardParametersActions } from './dashboardParametersReducer';
import { dashboardSourceActions } from './dashboardSourceReducer';
import {
    selectDashboard,
    selectEmbedDashboard,
} from './dashboardSourceSelectors';
import {
    selectDashboardFilters,
    selectDateZoomGranularity,
    selectHasParameterOrderChanged,
    selectHaveFiltersChanged,
    selectHavePinnedParametersChanged,
    selectRawTemporaryFilters,
    selectSavedParameters,
    selectTilesWithDateZoomApplied,
} from './selectors';

const resolve = <T>(value: SetStateAction<T>, previous: () => T): T =>
    typeof value === 'function' ? (value as (prev: T) => T)(previous()) : value;

/**
 * The context's setters, built once per store. They read the store at call
 * time, so they stay stable for the life of the dashboard.
 */
export const createDashboardContextActions = (
    store: Store<DashboardStoreState>,
) => {
    const { dispatch, getState } = store;
    const savedDateZoomSettings = () =>
        getSavedDateZoomSettings(selectDashboard(getState())?.config);
    const savedFilters = () => selectDashboard(getState())?.filters;
    const updateFilter = (
        category: 'dimensions' | 'metrics',
        filter: DashboardFilterRule,
        index: number,
        isTemporary: boolean,
        isInEditMode: boolean,
    ) => {
        const saved = savedFilters()?.[category];
        dispatch(
            dashboardFiltersActions.updateFilter({
                filter,
                index,
                isTemporary,
                isInEditMode,
                isFilterSaved: (saved || []).some(({ id }) => id === filter.id),
                originalFilter: savedFilters()?.[category][index],
                category,
            }),
        );
    };

    return {
        setEmbedDashboard: (
            value: SetStateAction<
                (Dashboard & InteractivityOptions) | undefined
            >,
        ) =>
            dispatch(
                dashboardSourceActions.setEmbedDashboard(
                    resolve(value, () => selectEmbedDashboard(getState())),
                ),
            ),
        setDashboardTiles: (
            value: SetStateAction<Dashboard['tiles'] | undefined>,
        ) =>
            dispatch(
                dashboardEditActions.setTiles(
                    resolve(value, () => selectDashboardTiles(getState())),
                ),
            ),
        setHaveTilesChanged: (value: SetStateAction<boolean>) =>
            dispatch(
                dashboardEditActions.setHaveTilesChanged(
                    resolve(value, () => selectHaveTilesChanged(getState())),
                ),
            ),
        setDashboardTabs: (value: SetStateAction<Dashboard['tabs']>) =>
            dispatch(
                dashboardEditActions.setTabs(
                    resolve(value, () => selectDashboardTabs(getState())),
                ),
            ),
        setHaveTabsChanged: (value: SetStateAction<boolean>) =>
            dispatch(
                dashboardEditActions.setHaveTabsChanged(
                    resolve(value, () => selectHaveTabsChanged(getState())),
                ),
            ),
        setActiveTab: (
            value: SetStateAction<Dashboard['tabs'][number] | undefined>,
        ) =>
            dispatch(
                dashboardEditActions.setActiveTab(
                    resolve(value, () => selectActiveTab(getState())),
                ),
            ),
        setDashboardCustomMetrics: (
            value: SetStateAction<AdditionalMetric[]>,
        ) =>
            dispatch(
                dashboardEditActions.setCustomMetrics(
                    resolve(value, () =>
                        selectDashboardCustomMetrics(getState()),
                    ),
                ),
            ),
        setHaveCustomMetricsChanged: (value: SetStateAction<boolean>) =>
            dispatch(
                dashboardEditActions.setHaveCustomMetricsChanged(
                    resolve(value, () =>
                        selectHaveCustomMetricsChanged(getState()),
                    ),
                ),
            ),
        setIsDateZoomDisabled: (value: SetStateAction<boolean>) =>
            dispatch(
                dashboardEditActions.setIsDateZoomDisabled(
                    resolve(value, () => selectIsDateZoomDisabled(getState())),
                ),
            ),
        setIsAddFilterDisabled: (value: SetStateAction<boolean>) =>
            dispatch(
                dashboardEditActions.setIsAddFilterDisabled(
                    resolve(value, () => selectIsAddFilterDisabled(getState())),
                ),
            ),
        setRequiredFiltersNote: (value: SetStateAction<string | undefined>) =>
            dispatch(
                dashboardEditActions.setRequiredFiltersNote(
                    resolve(value, () =>
                        selectEditedRequiredFiltersNote(getState()),
                    ),
                ),
            ),
        setDateZoomConfig: (dateZoomConfig: DateZoomConfig) =>
            dispatch(
                dashboardEditActions.setDateZoomConfig({
                    value: dateZoomConfig,
                    changed: true,
                    saved: savedDateZoomSettings().dateZoomConfig,
                }),
            ),
        setHasDateZoomConfigChanged: (value: SetStateAction<boolean>) => {
            const saved = savedDateZoomSettings().dateZoomConfig;
            const state = getState();
            dispatch(
                dashboardEditActions.setDateZoomConfig({
                    value: selectDateZoomConfig(state, saved),
                    changed: resolve(value, () =>
                        selectHasDateZoomConfigChanged(state, saved),
                    ),
                    saved,
                }),
            );
        },
        setDateZoomGranularities: (
            granularities: (DateGranularity | string)[],
        ) =>
            dispatch(
                dashboardEditActions.setDateZoomGranularities({
                    value: granularities,
                    saved: savedDateZoomSettings().dateZoomGranularities,
                }),
            ),
        setHaveDateZoomGranularitiesChanged: (value: SetStateAction<boolean>) =>
            dispatch(
                dashboardEditActions.setHaveDateZoomGranularitiesChanged(
                    resolve(value, () =>
                        selectHaveDateZoomGranularitiesChanged(getState()),
                    ),
                ),
            ),
        setDefaultDateZoomGranularity: (
            granularity: DateGranularity | string | undefined,
        ) =>
            dispatch(
                dashboardEditActions.setDefaultDateZoomGranularity({
                    value: granularity,
                    saved: savedDateZoomSettings().defaultDateZoomGranularity,
                }),
            ),
        setHasDefaultDateZoomGranularityChanged: (
            value: SetStateAction<boolean>,
        ) =>
            dispatch(
                dashboardEditActions.setHasDefaultDateZoomGranularityChanged(
                    resolve(value, () =>
                        selectHasDefaultDateZoomGranularityChanged(getState()),
                    ),
                ),
            ),
        // Resets saved filters, temporary filters and the URL overrides of saved filters
        resetDashboardFilters: () => {
            dispatch(
                dashboardFiltersActions.resetFilters(
                    applyEmbedFilterInteractivity(
                        savedFilters() ?? emptyDashboardFilters,
                        selectEmbedDashboard(getState()),
                    ),
                ),
            );
        },
        setDashboardFilters: (value: SetStateAction<DashboardFilters>) =>
            dispatch(
                dashboardFiltersActions.setDashboardFilters(
                    resolve(value, () => selectDashboardFilters(getState())),
                ),
            ),
        setDashboardTemporaryFilters: (
            value: SetStateAction<DashboardFilters>,
        ) =>
            dispatch(
                dashboardFiltersActions.setTemporaryFilters(
                    resolve(value, () => selectRawTemporaryFilters(getState())),
                ),
            ),
        setHaveFiltersChanged: (value: SetStateAction<boolean>) =>
            dispatch(
                dashboardFiltersActions.setHaveFiltersChanged(
                    resolve(value, () => selectHaveFiltersChanged(getState())),
                ),
            ),
        addDimensionDashboardFilter: (
            filter: DashboardFilterRule,
            isTemporary: boolean,
        ) =>
            dispatch(
                dashboardFiltersActions.addFilter({
                    filter,
                    isTemporary,
                    category: 'dimensions',
                }),
            ),
        updateDimensionDashboardFilter: (
            filter: DashboardFilterRule,
            index: number,
            isTemporary: boolean,
            isInEditMode: boolean,
        ) =>
            updateFilter(
                'dimensions',
                filter,
                index,
                isTemporary,
                isInEditMode,
            ),
        removeDimensionDashboardFilter: (index: number, isTemporary: boolean) =>
            dispatch(
                dashboardFiltersActions.removeFilter({
                    index,
                    isTemporary,
                    category: 'dimensions',
                }),
            ),
        addMetricDashboardFilter: (
            filter: DashboardFilterRule,
            isTemporary: boolean,
        ) =>
            dispatch(
                dashboardFiltersActions.addFilter({
                    filter,
                    isTemporary,
                    category: 'metrics',
                }),
            ),
        updateMetricDashboardFilter: (
            filter: DashboardFilterRule,
            index: number,
            isTemporary: boolean,
            isInEditMode: boolean,
        ) => updateFilter('metrics', filter, index, isTemporary, isInEditMode),
        removeMetricDashboardFilter: (index: number, isTemporary: boolean) =>
            dispatch(
                dashboardFiltersActions.removeFilter({
                    index,
                    isTemporary,
                    category: 'metrics',
                }),
            ),
        setChartZoomableFields: (
            tileUuid: string,
            fields: ChartZoomableField[],
        ) =>
            dispatch(
                dashboardDateZoomActions.setChartZoomableFields({
                    tileUuid,
                    fields,
                }),
            ),
        setTileChartSorts: (tileUuid: string, sorts: SortField[]) =>
            dispatch(
                dashboardChartSortActions.setTileSorts({ tileUuid, sorts }),
            ),
        setDateZoomGranularity: (
            value: SetStateAction<DateGranularity | string | undefined>,
        ) =>
            dispatch(
                dashboardDateZoomActions.setGranularity(
                    resolve(value, () => selectDateZoomGranularity(getState())),
                ),
            ),
        setTilesWithDateZoomApplied: (
            value: SetStateAction<Set<string> | undefined>,
        ) =>
            dispatch(
                dashboardDateZoomActions.setTilesWithDateZoomApplied(
                    resolve(value, () =>
                        selectTilesWithDateZoomApplied(getState()),
                    ),
                ),
            ),
        // Per-control runtime grain overrides only; an absent entry means "use the
        // control's persisted default" (the resolver applies `?? control.granularity`).
        setControlGranularity: (
            controlUuid: string,
            granularity: DateGranularity | string | undefined,
        ) =>
            dispatch(
                dashboardDateZoomActions.setControlGranularity({
                    controlUuid,
                    granularity,
                }),
            ),
        setSavedParameters: (value: SetStateAction<DashboardParameters>) =>
            dispatch(
                dashboardParametersActions.setSavedParameters(
                    resolve(value, () => selectSavedParameters(getState())),
                ),
            ),
        setParameter: (key: string, value: ParameterValue | null) =>
            dispatch(dashboardParametersActions.setParameter({ key, value })),
        clearAllParameters: () =>
            dispatch(dashboardParametersActions.clearAllParameters()),
        addParameterReferences: (tileUuid: string, references: string[]) =>
            dispatch(
                dashboardParametersActions.addParameterReferences({
                    tileUuid,
                    references,
                }),
            ),
        setTileChartSavedParameters: (
            tileUuid: string,
            values: ParametersValuesMap,
        ) =>
            dispatch(
                dashboardParametersActions.setTileChartSavedParameters({
                    tileUuid,
                    values,
                }),
            ),
        addParameterDefinitions: (parameters: ParameterDefinitions) =>
            dispatch(
                dashboardParametersActions.addParameterDefinitions(parameters),
            ),
        setPinnedParameters: (parameters: string[]) =>
            dispatch(
                dashboardParametersActions.setPinnedParameters(parameters),
            ),
        toggleParameterPin: (parameterKey: string) =>
            dispatch(
                dashboardParametersActions.toggleParameterPin(parameterKey),
            ),
        setHavePinnedParametersChanged: (value: SetStateAction<boolean>) =>
            dispatch(
                dashboardParametersActions.setHavePinnedParametersChanged(
                    resolve(value, () =>
                        selectHavePinnedParametersChanged(getState()),
                    ),
                ),
            ),
        setParameterOrder: (order: string[]) =>
            dispatch(dashboardParametersActions.setParameterOrder(order)),
        setHasParameterOrderChanged: (value: SetStateAction<boolean>) =>
            dispatch(
                dashboardParametersActions.setHasParameterOrderChanged(
                    resolve(value, () =>
                        selectHasParameterOrderChanged(getState()),
                    ),
                ),
            ),
    };
};
