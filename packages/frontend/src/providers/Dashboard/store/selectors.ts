import {
    isDashboardChartTileType,
    type DashboardFilters,
    type ParametersValuesMap,
} from '@lightdash/common';
import { createSelector } from '@reduxjs/toolkit';
import isEqual from 'lodash/isEqual';
import type { DashboardStoreState } from '.';

const selectDashboardData = (state: DashboardStoreState) => state.dashboardData;
const selectFilters = (state: DashboardStoreState) => state.dashboardFilters;

// ts-unused-exports:disable-next-line
export const selectAllFilters = createSelector(
    [selectFilters],
    (filters): DashboardFilters => ({
        dimensions: [
            ...filters.dashboardFilters.dimensions,
            ...filters.dashboardTemporaryFilters.dimensions,
        ],
        metrics: [
            ...filters.dashboardFilters.metrics,
            ...filters.dashboardTemporaryFilters.metrics,
        ],
        tableCalculations: [
            ...filters.dashboardFilters.tableCalculations,
            ...filters.dashboardTemporaryFilters.tableCalculations,
        ],
    }),
);

// ts-unused-exports:disable-next-line
export const selectParameterValues = createSelector(
    [selectDashboardData],
    (data): ParametersValuesMap =>
        Object.entries(data.parameters).reduce((acc, [key, param]) => {
            if (
                param.value !== null &&
                param.value !== undefined &&
                param.value !== ''
            ) {
                acc[key] = param.value;
            }
            return acc;
        }, {} as ParametersValuesMap),
);

// ts-unused-exports:disable-next-line
export const selectParametersHaveChanged = createSelector(
    [selectDashboardData],
    (data) => !isEqual(data.parameters, data.savedParameters),
);

// ts-unused-exports:disable-next-line
export const selectDashboardParameterReferences = createSelector(
    [selectDashboardData],
    (data) => new Set(Object.values(data.tileParameterReferences).flat()),
);

// ts-unused-exports:disable-next-line
export const selectAreAllChartsLoaded = createSelector(
    [selectDashboardData],
    (data) => {
        if (!data.dashboardTiles) return false;
        if (data.dashboardTabs.length > 0 && !data.activeTab) return false;

        const chartTileUuids = data.dashboardTiles
            .filter(isDashboardChartTileType)
            .filter((tile) => {
                if (!data.activeTab) return true;
                return !tile.tabUuid || tile.tabUuid === data.activeTab.uuid;
            })
            .map((tile) => tile.uuid);

        return chartTileUuids.every((uuid) => data.loadedTiles.has(uuid));
    },
);

// ts-unused-exports:disable-next-line
export const selectDashboardHasTimestampDimension = createSelector(
    [selectDashboardData],
    (data) => data.tilesWithTimestampDimension.size > 0,
);

// ts-unused-exports:disable-next-line
export const selectTileNamesById = createSelector(
    [selectDashboardData],
    (data) => {
        if (!data.dashboardTiles) return {};
        return data.dashboardTiles.reduce<Record<string, string>>(
            (acc, tile) => {
                const noTitle =
                    !tile.properties.title ||
                    tile.properties.title.length === 0;
                const isChart = isDashboardChartTileType(tile);
                let name = '';
                if (noTitle && isChart) {
                    name = tile.properties.chartName || '';
                } else if (tile.properties.title) {
                    name = tile.properties.title;
                }
                acc[tile.uuid] = name;
                return acc;
            },
            {},
        );
    },
);

// ts-unused-exports:disable-next-line
export const selectHasTilesThatSupportFilters = createSelector(
    [selectDashboardData],
    (data) => {
        const supportedTypes = ['saved_chart', 'sql_chart'] as const;
        return !!data.dashboardTiles?.some(({ type }) =>
            (supportedTypes as readonly string[]).includes(type),
        );
    },
);

// ts-unused-exports:disable-next-line
export const selectSelectedParametersCount = createSelector(
    [selectParameterValues],
    (parameterValues) =>
        Object.values(parameterValues).filter(
            (value) => value !== null && value !== '' && value !== undefined,
        ).length,
);

// ts-unused-exports:disable-next-line
export const selectMissingRequiredParameters = createSelector(
    [selectDashboardParameterReferences, selectDashboardData],
    (refs, data) => {
        if (!refs.size) return [];
        return Array.from(refs).filter(
            (parameterName) =>
                !data.parameters[parameterName] &&
                !data.parameterDefinitions[parameterName]?.default,
        );
    },
);
