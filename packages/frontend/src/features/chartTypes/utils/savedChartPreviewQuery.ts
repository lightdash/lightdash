import {
    getErrorMessage,
    isApiError,
    QueryExecutionContext,
    QueryHistoryStatus,
    type ApiExecuteAsyncMetricQueryResults,
    type ExecuteAsyncSavedChartRequestParams,
    type ItemsMap,
    type ReadyQueryResultsPage,
    type ResultRow,
} from '@lightdash/common';
import { lightdashApi } from '../../../api';
import { pollForResults } from '../../queryRunner/executeQuery';

/** One page of rows is all a preview needs, and the cap the picker reports. */
export const SAVED_CHART_PREVIEW_ROW_LIMIT = 500;

export type SavedChartPreviewQueryResult = {
    rows: ResultRow[];
    itemsMap: ItemsMap;
    pivotDetails: ReadyQueryResultsPage['pivotDetails'];
};

/**
 * Run a saved chart's own query once and hand back its rows.
 *
 * Unpivoted on purpose: the chart type binds the result columns itself, so a
 * preview pivots these rows using its current bindings, not the source chart's.
 */
export const executeSavedChartPreviewQuery = async ({
    projectUuid,
    chartUuid,
}: {
    projectUuid: string;
    chartUuid: string;
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
                pivotResults: false,
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
