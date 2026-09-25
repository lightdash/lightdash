import {
    isApiError,
    QueryHistoryStatus,
    QuerySourceType,
    type ApiExecuteSourceQueriesResults,
    type ExecuteSourceQueriesRequestParams,
    type PivotChartData,
    type PivotChartLayout,
    type PivotConfiguration,
    type ResultColumns,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../../../api';
import {
    pollForResults,
    readPivotQueryResults,
} from '../../../../../features/queryRunner/executeQuery';

export type ComposerSeriesSplitResult = {
    pivotChartData: PivotChartData;
    originalColumns: ResultColumns;
};

/** The referenced node result is gone; any other failure is a chart error. */
export class ComposerSeriesSplitExpiredError extends Error {}

const toPivotConfiguration = (
    layout: PivotChartLayout,
): PivotConfiguration => ({
    indexColumn: layout.x,
    valuesColumns: layout.y,
    groupByColumns: layout.groupBy,
    sortBy: undefined,
});

/** Pivots a stored node result on the compose engine: one DuckDB node reading it by query id. No warehouse query. */
const executeComposerSeriesSplit = async (
    projectUuid: string,
    queryUuid: string,
    layout: PivotChartLayout,
): Promise<ComposerSeriesSplitResult> => {
    const body = {
        queries: [
            {
                sourceType: QuerySourceType.DUCKDB,
                nodeId: 'series_split',
                sql: 'SELECT * FROM src',
                references: { src: queryUuid },
                pivotConfiguration: toPivotConfiguration(layout),
            },
        ],
    } satisfies ExecuteSourceQueriesRequestParams;
    const { queries } = await lightdashApi<ApiExecuteSourceQueriesResults>({
        url: `/projects/${projectUuid}/query-sources/queries`,
        version: 'v2',
        method: 'POST',
        body: JSON.stringify(body),
    }).catch((error: unknown) => {
        if (!isApiError(error)) throw error;
        // The referenced result expired or its file is gone.
        if (error.error.statusCode === 404)
            throw new ComposerSeriesSplitExpiredError(error.error.message);
        throw new Error(error.error.message);
    });
    const submission = queries[0];
    if (!submission) throw new Error('Series split was not submitted');

    const query = await pollForResults(projectUuid, submission.queryUuid);
    if (query.status === QueryHistoryStatus.EXPIRED)
        throw new ComposerSeriesSplitExpiredError(
            query.error ?? 'Results expired',
        );
    const { originalColumns, ...pivotResults } = await readPivotQueryResults(
        projectUuid,
        query,
    );
    return {
        pivotChartData: {
            ...pivotResults,
            columns: Object.keys(pivotResults.columns).map((reference) => ({
                reference,
            })),
        },
        originalColumns,
    };
};

export const useComposerSeriesSplit = ({
    projectUuid,
    queryUuid,
    layout,
}: {
    projectUuid: string;
    queryUuid: string;
    layout: PivotChartLayout;
}) =>
    useQuery<ComposerSeriesSplitResult, Error>({
        queryKey: [
            'composerSeriesSplit',
            projectUuid,
            queryUuid,
            toPivotConfiguration(layout),
        ],
        queryFn: () =>
            executeComposerSeriesSplit(projectUuid, queryUuid, layout),
        staleTime: Infinity,
        retry: false,
    });
