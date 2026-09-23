import {
    getErrorMessage,
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
} from '@lightdash/common';
import { lightdashApi } from '../../../api';
import { pollForResults } from '../../queryRunner/executeQuery';

/** One page of rows is all a preview needs, and the cap the picker reports. */
export const SAVED_CHART_PREVIEW_ROW_LIMIT = 500;

export type SavedChartPreviewQueryResult = {
    rows: ResultRow[];
    /** Actual result fields, including aliases introduced by saved merges. */
    metricQuery?: MetricQuery;
    itemsMap: ItemsMap;
    pivotDetails: ReadyQueryResultsPage['pivotDetails'];
};

/** Run the saved query with its native pivot or an explicit preview override. */
export const executeSavedChartPreviewQuery = async ({
    projectUuid,
    chartUuid,
    pivotResults = true,
    pivotConfiguration,
}: {
    projectUuid: string;
    chartUuid: string;
    pivotResults?: boolean;
    pivotConfiguration?: PivotConfiguration;
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
                pivotResults,
                pivotConfiguration,
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
            metricQuery: query.metricQuery,
            itemsMap: query.fields,
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
