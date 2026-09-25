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

export type ComposerPivotResult = {
    pivotChartData: PivotChartData;
    originalColumns: ResultColumns;
};

/** The referenced node result is gone; any other failure is a chart error. */
export class ComposerPivotExpiredError extends Error {}

const toPivotConfiguration = (
    layout: PivotChartLayout,
): PivotConfiguration => ({
    indexColumn: layout.x,
    valuesColumns: layout.y,
    groupByColumns: layout.groupBy,
    sortBy: layout.sortBy,
});

/** Pivots a stored node result on the compose engine: one DuckDB node reading it by query id. No warehouse query. */
const executeComposerPivot = async (
    projectUuid: string,
    queryUuid: string,
    layout: PivotChartLayout,
): Promise<ComposerPivotResult> => {
    const body = {
        queries: [
            {
                sourceType: QuerySourceType.DUCKDB,
                nodeId: 'viz_pivot',
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
            throw new ComposerPivotExpiredError(error.error.message);
        throw new Error(error.error.message);
    });
    const submission = queries[0];
    if (!submission) throw new Error('Pivot query was not submitted');

    const query = await pollForResults(projectUuid, submission.queryUuid);
    if (query.status === QueryHistoryStatus.EXPIRED)
        throw new ComposerPivotExpiredError(query.error ?? 'Results expired');
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

/** The pivoted re-run of a node result; the previous chart's data stays while an edit re-runs. */
export const useComposerPivot = ({
    projectUuid,
    queryUuid,
    layout,
}: {
    projectUuid: string;
    queryUuid: string;
    layout: PivotChartLayout;
}) =>
    useQuery<ComposerPivotResult, Error>({
        queryKey: [
            'composerPivot',
            projectUuid,
            queryUuid,
            toPivotConfiguration(layout),
        ],
        queryFn: () => executeComposerPivot(projectUuid, queryUuid, layout),
        staleTime: Infinity,
        retry: false,
        keepPreviousData: true,
    });
