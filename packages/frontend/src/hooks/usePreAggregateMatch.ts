import {
    findMatch,
    type MatchResult,
    type MetricQuery,
} from '@lightdash/common';
import { useMemo } from 'react';
import {
    selectAdditionalMetrics,
    selectCustomDimensions,
    selectDimensions,
    selectFilters,
    selectMetrics,
    selectQueryLimit,
    selectSorts,
    selectTableCalculations,
    selectTableName,
    selectTimezone,
    useExplorerSelector,
} from '../features/explorer/store';
import useHealth from './health/useHealth';
import { useExplore } from './useExplore';

type PreAggregateMatchResult = {
    matchResult: MatchResult | null;
    isEnabled: boolean;
    exploreName: string | undefined;
};

export const usePreAggregateMatch = (): PreAggregateMatchResult => {
    const { data: health } = useHealth();
    const isEnabled = health?.preAggregates?.enabled ?? false;

    const tableName = useExplorerSelector(selectTableName);
    const dimensions = useExplorerSelector(selectDimensions);
    const metrics = useExplorerSelector(selectMetrics);
    const filters = useExplorerSelector(selectFilters);
    const sorts = useExplorerSelector(selectSorts);
    const limit = useExplorerSelector(selectQueryLimit);
    const tableCalculations = useExplorerSelector(selectTableCalculations);
    const additionalMetrics = useExplorerSelector(selectAdditionalMetrics);
    const customDimensions = useExplorerSelector(selectCustomDimensions);
    const timezone = useExplorerSelector(selectTimezone);

    const { data: explore } = useExplore(tableName);

    const matchResult = useMemo(() => {
        if (
            !isEnabled ||
            !explore ||
            !explore.preAggregates ||
            explore.preAggregates.length === 0
        ) {
            return null;
        }

        const metricQuery: MetricQuery = {
            exploreName: tableName,
            dimensions: Array.from(dimensions),
            metrics: Array.from(metrics),
            sorts,
            filters,
            limit: limit || 500,
            tableCalculations,
            additionalMetrics,
            customDimensions,
            timezone: timezone ?? undefined,
        };

        return findMatch(metricQuery, explore);
    }, [
        isEnabled,
        explore,
        tableName,
        dimensions,
        metrics,
        sorts,
        filters,
        limit,
        tableCalculations,
        additionalMetrics,
        customDimensions,
        timezone,
    ]);

    return { matchResult, isEnabled, exploreName: tableName };
};
