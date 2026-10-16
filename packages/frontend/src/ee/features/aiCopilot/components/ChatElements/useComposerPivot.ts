import {
    assertUnreachable,
    DEFAULT_RESULTS_PAGE_SIZE,
    isApiError,
    QueryHistoryStatus,
    QuerySourceType,
    type ApiAiAgentArtifactPivotQuery,
    type ApiAiAgentArtifactPivotQueryRequest,
    type ApiExecuteSourceQueriesResults,
    type ApiGetAsyncQueryResults,
    type ExecuteSourceQueriesRequestParams,
    type PivotChartData,
    type PivotChartLayout,
    type PivotConfiguration,
    type RawResultRow,
    type ReadyQueryResultsPage,
    type ResultColumns,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../../../api';
import {
    pollForResults,
    readPivotQueryResults,
} from '../../../../../features/queryRunner/executeQuery';
import {
    getAiAgentArtifactPivotQueryUrl,
    getAiAgentArtifactResultsUrl,
} from '../../hooks/aiAgentRouting';

export type ComposerPivotArtifact = {
    agentUuid: string;
    artifactUuid: string;
    versionUuid: string;
};

export type ComposerPivotResult = {
    pivotChartData: PivotChartData;
    originalColumns: ResultColumns;
};

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
        throw new Error(error.error.message);
    });
    const submission = queries[0];
    if (!submission) throw new Error('Pivot query was not submitted');

    const query = await pollForResults(projectUuid, submission.queryUuid);
    if (query.status === QueryHistoryStatus.EXPIRED)
        throw new Error(query.error ?? 'Results expired');
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

const executeArtifactComposerPivot = async (
    projectUuid: string,
    queryUuid: string,
    layout: PivotChartLayout,
    artifact: ComposerPivotArtifact,
): Promise<ComposerPivotResult> => {
    const body = {
        queryUuid,
        pivotConfiguration: toPivotConfiguration(layout),
    } satisfies ApiAiAgentArtifactPivotQueryRequest;
    const { queryUuid: pivotQueryUuid } =
        await lightdashApi<ApiAiAgentArtifactPivotQuery>({
            url: getAiAgentArtifactPivotQueryUrl({ projectUuid, ...artifact }),
            method: 'POST',
            body: JSON.stringify(body),
        }).catch((error: unknown) => {
            if (!isApiError(error)) throw error;
            throw new Error(error.error.message);
        });
    const resultsUrl = getAiAgentArtifactResultsUrl({
        projectUuid,
        ...artifact,
        queryUuid: pivotQueryUuid,
        cached: false,
    });
    const fetchPage = async (page: number): Promise<ReadyQueryResultsPage> => {
        let backoffMs = 250;
        while (true) {
            const result = await lightdashApi<ApiGetAsyncQueryResults>({
                url: `${resultsUrl}&page=${page}&pageSize=${DEFAULT_RESULTS_PAGE_SIZE}`,
                method: 'GET',
            }).catch((error: unknown) => {
                if (!isApiError(error)) throw error;
                throw new Error(error.error.message);
            });
            switch (result.status) {
                case QueryHistoryStatus.READY:
                    return result;
                case QueryHistoryStatus.ERROR:
                case QueryHistoryStatus.EXPIRED:
                    throw new Error(result.error ?? 'Results expired');
                case QueryHistoryStatus.CANCELLED:
                    throw new Error('Pivot query was cancelled');
                case QueryHistoryStatus.PENDING:
                case QueryHistoryStatus.QUEUED:
                case QueryHistoryStatus.EXECUTING:
                    await new Promise((resolve) =>
                        setTimeout(resolve, backoffMs),
                    );
                    backoffMs = Math.min(backoffMs * 2, 1000);
                    break;
                default:
                    return assertUnreachable(result, 'Unknown query status');
            }
        }
    };
    const firstPage = await fetchPage(1);
    const { pivotDetails, columns } = firstPage;
    if (!pivotDetails) throw new Error('Pivot details are unavailable');
    const rows = [...firstPage.rows];
    let { nextPage } = firstPage;
    while (nextPage !== undefined) {
        const page = await fetchPage(nextPage);
        rows.push(...page.rows);
        nextPage = page.nextPage;
    }
    const results: RawResultRow[] = rows.map((row) =>
        Object.fromEntries(
            Object.entries(row).map(([key, cell]) => [key, cell.value.raw]),
        ),
    );
    return {
        pivotChartData: {
            queryUuid: pivotQueryUuid,
            fileUrl: undefined,
            results,
            indexColumn: pivotDetails.indexColumn,
            valuesColumns: pivotDetails.valuesColumns,
            columnCount: pivotDetails.totalColumnCount ?? undefined,
            columns: Object.keys(columns).map((reference) => ({ reference })),
        },
        originalColumns: pivotDetails.originalColumns,
    };
};

/** The pivoted re-run of a node result; idle without a stored result or a layout to pivot. */
export const useComposerPivot = ({
    projectUuid,
    queryUuid,
    layout,
    artifact,
}: {
    projectUuid: string;
    queryUuid: string | null;
    layout: PivotChartLayout | null;
    artifact: ComposerPivotArtifact | null;
}) =>
    useQuery<ComposerPivotResult, Error>({
        queryKey: [
            'composerPivot',
            artifact,
            projectUuid,
            queryUuid,
            layout ? toPivotConfiguration(layout) : null,
        ],
        queryFn: () =>
            queryUuid && layout
                ? artifact !== null
                    ? executeArtifactComposerPivot(
                          projectUuid,
                          queryUuid,
                          layout,
                          artifact,
                      )
                    : executeComposerPivot(projectUuid, queryUuid, layout)
                : Promise.reject(new Error('Nothing to pivot')),
        enabled: queryUuid !== null && layout !== null,
        staleTime: Infinity,
        retry: false,
    });
