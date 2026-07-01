import {
    ChartType,
    type CreateSavedChart,
    type CreateSavedChartVersion,
} from '@lightdash/common';
import type { QueryEvent } from '../hooks/useAppSdkBridge';

/**
 * Build a table-chart *version* (viz config + metric query) from a tracked app
 * query. Shared by the Query Inspector's "Open in Explore" link and its
 * "Save to Lightdash" action so both map a query the same way.
 *
 * A tracked query's `filters`/`sorts`/field ids are already in backend
 * `MetricQuery` shape (the SDK converts them before the bridge captures them),
 * so no reconciliation is needed — the only synthesis is the viz defaults
 * (a plain TABLE) and an explicit `columnOrder` derived from the query fields.
 */
export const trackedQueryToChartVersion = (
    query: QueryEvent,
): CreateSavedChartVersion => {
    const columnOrder = [
        ...query.dimensions,
        ...query.metrics,
        ...query.tableCalculations.map((tc) => tc.name),
    ];
    return {
        tableName: query.exploreName,
        metricQuery: {
            exploreName: query.exploreName,
            dimensions: query.dimensions,
            metrics: query.metrics,
            filters:
                (query.filters as CreateSavedChartVersion['metricQuery']['filters']) ??
                {},
            sorts:
                (query.sorts as CreateSavedChartVersion['metricQuery']['sorts']) ??
                [],
            limit: query.limit,
            tableCalculations: query.tableCalculations.map((tc) => ({
                name: tc.name,
                displayName: tc.displayName,
                sql: tc.sql,
            })),
        },
        chartConfig: { type: ChartType.TABLE, config: {} },
        tableConfig: { columnOrder },
    };
};

/**
 * Build a full `CreateSavedChart` (a table chart) from a tracked app query,
 * adding a name and target space. Posted to `POST /projects/{uuid}/saved`.
 * Omit `spaceUuid` to let the backend pick the user's first viewable space.
 */
export const trackedQueryToCreateChart = (
    query: QueryEvent,
    opts: { name: string; spaceUuid?: string },
): CreateSavedChart => ({
    ...trackedQueryToChartVersion(query),
    name: opts.name,
    spaceUuid: opts.spaceUuid,
    dashboardUuid: null,
});
