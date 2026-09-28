import {
    getErrorMessage,
    getItemId,
    FieldType,
    isApiError,
    QueryExecutionContext,
    QueryHistoryStatus,
    type ApiExecuteAsyncMetricQueryResults,
    type ExecuteAsyncSavedChartRequestParams,
    type ItemsMap,
    type MetricQuery,
    type PivotConfiguration,
    type ReadyQueryResultsPage,
    type ResultRow,
    type SubtotalLevelRequest,
} from '@lightdash/common';
import { lightdashApi } from '../../../api';
import { pollForResults } from '../../queryRunner/executeQuery';

/** One page of rows is all a preview needs, and the cap the picker reports. */
export const SAVED_CHART_PREVIEW_ROW_LIMIT = 500;

export type SavedChartPreviewQueryResult = {
    rows: ResultRow[];
    /** Only result columns; `itemsMap` may include source fields for bindings. */
    resultColumnIds?: string[];
    /** Actual result fields, including aliases introduced by saved merges. */
    metricQuery?: MetricQuery;
    itemsMap: ItemsMap;
    pivotDetails: ReadyQueryResultsPage['pivotDetails'];
};

// Already-selected fields stay bindable even when hidden from Explore's picker.
const getBindableSavedFields = (
    itemsMap: ItemsMap,
    selectedIds?: Set<string>,
): ItemsMap =>
    Object.fromEntries(
        Object.entries(itemsMap).map(([id, item]) => [
            id,
            'hidden' in item && (!selectedIds || selectedIds.has(id))
                ? { ...item, hidden: false }
                : item,
        ]),
    );

/** Resolve saved selections before executing rows, including query-local fields. */
export const getSavedChartSourceItemsMap = (
    exploreItemsMap: ItemsMap,
    metricQuery: MetricQuery,
): ItemsMap => {
    const selectedIds = new Set([
        ...metricQuery.dimensions,
        ...metricQuery.metrics,
        ...metricQuery.tableCalculations.map(({ name }) => name),
    ]);
    const candidates = [
        ...Object.values(exploreItemsMap),
        ...(metricQuery.customDimensions ?? []),
        ...(metricQuery.additionalMetrics ?? []).map((metric) => ({
            ...metric,
            fieldType: FieldType.METRIC as const,
            label: metric.label ?? metric.name,
            tableLabel:
                Object.values(exploreItemsMap).flatMap((item) =>
                    'tableLabel' in item &&
                    'table' in item &&
                    item.table === metric.table
                        ? [item.tableLabel]
                        : [],
                )[0] ?? metric.table,
            hidden: metric.hidden ?? false,
        })),
        ...metricQuery.tableCalculations,
    ];
    return getBindableSavedFields(
        Object.fromEntries(
            candidates
                .map((item) => [getItemId(item), item] as const)
                .filter(([id]) => selectedIds.has(id)),
        ),
    );
};

/** Run the saved query with its native pivot or an explicit preview override. */
export const executeSavedChartPreviewQuery = async ({
    projectUuid,
    chartUuid,
    pivotResults = true,
    pivotConfiguration,
    subtotalLevel,
    sourceMetricQuery,
}: {
    projectUuid: string;
    chartUuid: string;
    pivotResults?: boolean;
    pivotConfiguration?: PivotConfiguration;
    subtotalLevel?: SubtotalLevelRequest;
    sourceMetricQuery?: MetricQuery;
}): Promise<SavedChartPreviewQueryResult> => {
    try {
        const query = await lightdashApi<ApiExecuteAsyncMetricQueryResults>({
            url: `/projects/${projectUuid}/query/chart`,
            version: 'v2',
            method: 'POST',
            body: JSON.stringify({
                context: QueryExecutionContext.DATA_APP_SAMPLE,
                chartUuid,
                limit: SAVED_CHART_PREVIEW_ROW_LIMIT,
                pivotResults: subtotalLevel ? false : pivotResults,
                pivotConfiguration: subtotalLevel
                    ? undefined
                    : pivotConfiguration,
                ...(subtotalLevel ? { subtotalLevel } : {}),
            } satisfies ExecuteAsyncSavedChartRequestParams),
        });

        const results = await pollForResults(projectUuid, query.queryUuid);
        if (results.status !== QueryHistoryStatus.READY) {
            throw new Error(
                ('error' in results ? results.error : null) ??
                    'The saved chart query did not finish',
            );
        }

        return {
            rows: results.rows,
            ...(subtotalLevel
                ? { resultColumnIds: Object.keys(results.columns) }
                : {}),
            metricQuery: query.metricQuery,
            itemsMap: getBindableSavedFields(
                query.fields,
                new Set([
                    ...Object.keys(results.columns),
                    ...query.metricQuery.dimensions,
                    ...query.metricQuery.metrics,
                    ...query.metricQuery.tableCalculations.map(
                        ({ name }) => name,
                    ),
                    ...(subtotalLevel && sourceMetricQuery
                        ? [
                              ...sourceMetricQuery.dimensions,
                              ...sourceMetricQuery.metrics,
                              ...sourceMetricQuery.tableCalculations.map(
                                  ({ name }) => name,
                              ),
                          ]
                        : []),
                ]),
            ),
            pivotDetails: results.pivotDetails,
        };
    } catch (error) {
        // The api client rejects with `ApiError`, which is not an `Error`;
        // normalise so callers only ever read `.message`.
        throw new Error(
            isApiError(error) ? error.error.message : getErrorMessage(error),
        );
    }
};
