import {
    getErrorMessage,
    isApiError,
    isDateItem,
    isDimension,
    isField,
    isMetric,
    QueryExecutionContext,
    QueryHistoryStatus,
    type ApiExecuteAsyncMetricQueryResults,
    type ExecuteAsyncMetricQueryRequestParams,
    type ItemsMap,
    type MetricQueryRequest,
    type PivotConfiguration,
    type SortField,
} from '@lightdash/common';
import { lightdashApi } from '../../../api';
import { pollForResults } from '../../queryRunner/executeQuery';
import { type SavedChartPreviewQueryResult } from './savedChartPreviewQuery';

/** Same page of rows the saved-chart preview runs. */
const EXPLORE_PREVIEW_ROW_LIMIT = 500;

/**
 * The ad-hoc query behind an explore source: the picked fields, sorted by the
 * first date dimension (newest first) or else the first dimension.
 */
export const buildExplorePreviewMetricQuery = (
    exploreName: string,
    itemsMap: ItemsMap,
    fieldIds: string[],
): Omit<MetricQueryRequest, 'csvLimit'> => {
    const fields = fieldIds.flatMap((id) => {
        const item = itemsMap[id];
        return item && isField(item) ? [{ id, item }] : [];
    });
    const dimensions = fields.filter(({ item }) => isDimension(item));
    const metrics = fields.filter(({ item }) => isMetric(item));
    const dateDimension = dimensions.find(({ item }) => isDateItem(item));
    const sorts: SortField[] = dateDimension
        ? [{ fieldId: dateDimension.id, descending: true }]
        : dimensions[0]
          ? [{ fieldId: dimensions[0].id, descending: false }]
          : [];

    return {
        exploreName,
        dimensions: dimensions.map(({ id }) => id),
        metrics: metrics.map(({ id }) => id),
        filters: {},
        sorts,
        limit: EXPLORE_PREVIEW_ROW_LIMIT,
        tableCalculations: [],
    };
};

/** Run an explore's ad-hoc query once and hand back its rows. */
export const executeExplorePreviewQuery = async ({
    projectUuid,
    query,
    pivotConfiguration,
}: {
    projectUuid: string;
    query: Omit<MetricQueryRequest, 'csvLimit'>;
    pivotConfiguration?: PivotConfiguration;
}): Promise<SavedChartPreviewQueryResult> => {
    try {
        const started = await lightdashApi<ApiExecuteAsyncMetricQueryResults>({
            url: `/projects/${projectUuid}/query/metric-query`,
            version: 'v2',
            method: 'POST',
            body: JSON.stringify({
                context: QueryExecutionContext.DATA_APP_SAMPLE,
                query,
                pivotConfiguration,
            } satisfies ExecuteAsyncMetricQueryRequestParams),
        });

        const results = await pollForResults(projectUuid, started.queryUuid);
        if (results.status !== QueryHistoryStatus.READY) {
            throw new Error(
                ('error' in results ? results.error : null) ??
                    'The explore query did not finish',
            );
        }

        return {
            rows: results.rows,
            itemsMap: started.fields,
            pivotDetails: results.pivotDetails,
        };
    } catch (error) {
        // The api client rejects with `ApiError`, which is not an `Error`.
        throw new Error(
            isApiError(error) ? error.error.message : getErrorMessage(error),
        );
    }
};
