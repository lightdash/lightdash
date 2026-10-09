import {
    DEFAULT_RUN_SQL_LIMIT,
    getItemLabelWithoutTableName,
    getValidAiQueryLimit,
    runContentQueryToolDefinition,
    type AiMetricQueryWithFilters,
    type ChartAsCode,
    type Filters,
    type ItemsMap,
    type MetricQuery,
    type ParametersValuesMap,
    type ToolRunContentQueryStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import { stringify } from 'csv-stringify/sync';
import { type QueryReviewer } from '../decisions/queryReview';
import { NO_RESULTS_RETRY_PROMPT } from '../prompts/noResultsRetry';
import type {
    GetSavedChartFn,
    RunAsyncQueryFn,
    RunSavedChartQueryFn,
    RunSqlJobFn,
    UpdateProgressFn,
    ValidateContentFn,
} from '../types/aiAgentDependencies';
import { convertQueryResultsToCsv } from '../utils/convertQueryResultsToCsv';
import { getContextTruncationNote } from '../utils/queryResultSummary';
import { serializeData } from '../utils/serializeData';
import {
    findSqlScopeViolations,
    formatSqlScopeError,
    type SqlScope,
} from '../utils/sqlScope';
import {
    toolFailure,
    type ExecuteStructuredToolResult,
    type ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorOutput } from '../utils/toolErrorHandler';
import { buildSavedChartHeader } from './runSavedChart';
import { validateSelectOnly } from './runSql';
import {
    createSqlApprovalGate,
    type SqlApprovalCopy,
    type SqlApprovalDependencies,
} from './sqlApprovalGate';
import { RUN_SQL_REJECTED_RESULT, SqlNotApprovedError } from './sqlApprovals';

// Null when SQL mode is off for the agent.
export type ContentSqlQuerying = {
    runSqlJob: RunSqlJobFn;
    approval: SqlApprovalDependencies;
    maxLimit: number;
    sqlScope: SqlScope | null;
    hyphenatedIdentifiers: boolean;
};

type Dependencies = {
    reviewQuery?: QueryReviewer;
    updateProgress: UpdateProgressFn;
    runAsyncQuery: RunAsyncQueryFn;
    runSavedChartQuery: RunSavedChartQueryFn;
    getSavedChart: GetSavedChartFn;
    validateContent: ValidateContentFn;
    maxLimit: number;
    maxContextRows: number;
    enableDataAccess: boolean;
    sqlQuerying: ContentSqlQuerying | null;
};

const toolDefinition = runContentQueryToolDefinition.for('agent');

type RunContentQueryResult =
    | ExecuteStructuredToolResult<ToolRunContentQueryStructuredContent>
    | ExecuteToolErrorResult;

type RowsOutcome = Extract<
    ToolRunContentQueryStructuredContent,
    { outcome: 'rows' }
>;

/** A run pinned to a tool allowlist without runSql (data-app investigations) gets no raw SQL here either. */
export const canRunContentQuerySql = ({
    canRunSql,
    toolAllowlist,
}: {
    canRunSql: boolean;
    toolAllowlist: ReadonlySet<string> | null;
}): boolean =>
    canRunSql && (toolAllowlist === null || toolAllowlist.has('runSql'));

export const CONTENT_SQL_DISABLED_RESULT =
    'Running SQL is not available in this conversation. Query an explore with source.type "metricQuery" instead.';

const CONTENT_SQL_APPROVAL_COPY: SqlApprovalCopy = {
    slackText: 'SQL execution',
    pendingProgress: 'Awaiting approval to run SQL...',
    approvedProgress: 'Running SQL query...',
    rejectedResult: RUN_SQL_REJECTED_RESULT,
    timeoutResult:
        'SQL approval timed out after 5 minutes with no response. The user may have stepped away — acknowledge politely and wait for them to re-ask.',
    previousTimeoutResult:
        'A previous SQL approval timed out in this response. Do not run SQL again in this response; tell the user the SQL was not approved and ask them to retry when ready.',
};

const RUN_CONTENT_SQL_APPROVAL_HEADING = 'Awaiting approval to run SQL';

const describeSavedChartStructure = (
    chartUuid: string,
    name: string,
    metricQuery: MetricQuery,
) => ({
    chartUuid,
    name,
    exploreName: metricQuery.exploreName,
    dimensions: metricQuery.dimensions,
    metrics: metricQuery.metrics,
});

// Mirrors the full-spec header rendered by buildSavedChartHeader.
const describeSavedChartSpec = (
    chartUuid: string,
    name: string,
    metricQuery: MetricQuery,
): RowsOutcome['chart'] => ({
    ...describeSavedChartStructure(chartUuid, name, metricQuery),
    filters: metricQuery.filters,
    sorts: metricQuery.sorts,
    limit: metricQuery.limit,
    tableCalculations: (metricQuery.tableCalculations ?? []).map(
        (calculation) => calculation.name,
    ),
    customMetrics: (metricQuery.additionalMetrics ?? []).map(
        (metric) => `${metric.table}_${metric.name}`,
    ),
    customDimensions: (metricQuery.customDimensions ?? []).map(
        (dimension) => dimension.id,
    ),
});

// The raw typed values behind the CSV cells, and the CSV header labels.
const buildShownTable = (
    queryResults: { rows: Record<string, unknown>[]; fields: ItemsMap },
    maxContextRows: number,
) => {
    const fieldIds = queryResults.rows[0]
        ? Object.keys(queryResults.rows[0])
        : [];
    const rows = queryResults.rows.slice(0, maxContextRows);
    return {
        rowCount: queryResults.rows.length,
        shownRowCount: rows.length,
        columns: fieldIds.map((fieldId) => {
            const item = queryResults.fields[fieldId];
            return {
                fieldId,
                label: item ? getItemLabelWithoutTableName(item) : fieldId,
            };
        }),
        rows,
    };
};

export const getRunContentQuery = ({
    reviewQuery,
    updateProgress,
    runAsyncQuery,
    runSavedChartQuery,
    getSavedChart,
    validateContent,
    maxLimit,
    maxContextRows,
    enableDataAccess,
    sqlQuerying,
}: Dependencies) => {
    const approvalGate = sqlQuerying
        ? createSqlApprovalGate(
              sqlQuerying.approval,
              'runContentQuery',
              CONTENT_SQL_APPROVAL_COPY,
          )
        : null;

    const runSqlSource = async (
        source: { sql: string; limit: number | null },
        toolCallId: string,
    ): Promise<RunContentQueryResult> => {
        if (!sqlQuerying || !approvalGate) {
            return toolFailure(CONTENT_SQL_DISABLED_RESULT);
        }
        const { sql } = source;
        // Every return goes through persistIfResumed so a resumed call stores its result.
        const { approveSql, persistIfResumed } = await approvalGate.forToolCall(
            toolCallId,
            { sql },
        );

        try {
            const scopeViolations = findSqlScopeViolations(
                sql,
                sqlQuerying.sqlScope,
                { hyphenatedIdentifiers: sqlQuerying.hyphenatedIdentifiers },
            );
            if (scopeViolations.length > 0 && sqlQuerying.sqlScope) {
                return await persistIfResumed(
                    toolFailure(
                        formatSqlScopeError(
                            scopeViolations,
                            sqlQuerying.sqlScope,
                        ),
                    ),
                );
            }
            validateSelectOnly(sql);

            try {
                await approveSql({
                    sql,
                    heading: RUN_CONTENT_SQL_APPROVAL_HEADING,
                });
            } catch (e) {
                if (e instanceof SqlNotApprovedError) {
                    return await persistIfResumed(toolFailure(e.message));
                }
                throw e;
            }

            const limit = Math.min(
                source.limit ?? DEFAULT_RUN_SQL_LIMIT,
                sqlQuerying.maxLimit,
            );
            const [{ rows, columns, rowCount }, review] = await Promise.all([
                sqlQuerying.runSqlJob({ sql, limit }),
                enableDataAccess
                    ? (reviewQuery?.({ kind: 'sql', sql, limit }) ?? '')
                    : '',
            ]);

            if (!enableDataAccess) {
                return await persistIfResumed({
                    result: `Data access is disabled for this agent. The SQL ran and returned ${rowCount} rows. Columns: ${columns.join(
                        ', ',
                    )}.`,
                    metadata: { status: 'success' as const },
                    structuredContent: {
                        outcome: 'dataAccessDisabled' as const,
                        chart: null,
                    },
                });
            }

            if (rowCount === 0) {
                const result = reviewQuery
                    ? await reviewQuery(
                          { kind: 'sql', sql, limit },
                          { emptyResult: true, review },
                      )
                    : NO_RESULTS_RETRY_PROMPT;
                return await persistIfResumed({
                    result: `Query returned 0 rows.${
                        columns.length > 0
                            ? ` Columns: ${columns.join(', ')}.`
                            : ''
                    } ${result}`,
                    metadata: { status: 'success' as const },
                    structuredContent: {
                        outcome: 'noResults' as const,
                        review: reviewQuery ? result : null,
                    },
                });
            }

            const shownRows = rows.slice(0, maxContextRows);
            const truncationNote = getContextTruncationNote({
                rowCount,
                maxContextRows,
            });
            const csv = stringify(
                shownRows.map((row) => columns.map((column) => row[column])),
                { header: true, columns },
            );
            return await persistIfResumed({
                result: `${truncationNote}${serializeData(csv, 'csv')}${review}`,
                metadata: { status: 'success' as const },
                structuredContent: {
                    outcome: 'rows' as const,
                    chart: null,
                    rowCount,
                    shownRowCount: shownRows.length,
                    columns: columns.map((label) => ({
                        fieldId: null,
                        label,
                    })),
                    rows: shownRows.map((row) =>
                        columns.map((column) => row[column]),
                    ),
                    review: review === '' ? null : review,
                    truncationNote:
                        truncationNote === '' ? null : truncationNote,
                },
            });
        } catch (error) {
            return persistIfResumed(
                toolErrorOutput(error, 'Error running SQL query.'),
            );
        }
    };

    return tool({
        ...toolDefinition,
        needsApproval: async ({ source }, { toolCallId }) =>
            source.type === 'sql' && approvalGate !== null
                ? approvalGate.needsNativeApproval({
                      toolCallId,
                      sql: source.sql,
                  })
                : false,
        execute: async ({ source }, { toolCallId }) => {
            if (source.type === 'sql') {
                return runSqlSource(source, toolCallId);
            }
            try {
                await updateProgress('Running content query...');

                if (
                    source.type === 'chart' ||
                    source.type === 'dashboardChart'
                ) {
                    const savedChart = await getSavedChart(source.chartSlug);
                    const { metricQuery, name, uuid } = savedChart;

                    if (!enableDataAccess) {
                        return {
                            result: `${buildSavedChartHeader(
                                uuid,
                                name,
                                metricQuery,
                                {
                                    includeFullSpec: false,
                                },
                            )}Data access is disabled for this agent. Reason about the chart from its structure above; do not assume specific row values.`,
                            metadata: {
                                status: 'success' as const,
                            },
                            structuredContent: {
                                outcome: 'dataAccessDisabled',
                                chart: describeSavedChartStructure(
                                    uuid,
                                    name,
                                    metricQuery,
                                ),
                            },
                        };
                    }

                    let pendingReview: Promise<string> | null = null;
                    const queryResults = await runSavedChartQuery({
                        chartUuid: uuid,
                        dashboardSlug:
                            source.type === 'dashboardChart'
                                ? source.dashboardSlug
                                : null,
                        limit: source.limit,
                        ...(reviewQuery
                            ? {
                                  onQueryPrepared: (execution) => {
                                      pendingReview = reviewQuery({
                                          kind: 'semantic',
                                          query: execution.metricQuery,
                                          parameters:
                                              execution.usedParametersValues,
                                          timezone: execution.resolvedTimezone,
                                      });
                                  },
                              }
                            : {}),
                    });
                    const review =
                        (await (pendingReview ??
                            reviewQuery?.({
                                kind: 'semantic',
                                query: queryResults.execution.metricQuery,
                                parameters:
                                    queryResults.execution.usedParametersValues,
                                timezone:
                                    queryResults.execution.resolvedTimezone,
                            }))) ?? '';

                    if (queryResults.rows.length === 0) {
                        const result = reviewQuery
                            ? await reviewQuery(
                                  {
                                      kind: 'semantic',
                                      query: queryResults.execution.metricQuery,
                                      parameters:
                                          queryResults.execution
                                              .usedParametersValues,
                                      timezone:
                                          queryResults.execution
                                              .resolvedTimezone,
                                  },
                                  { emptyResult: true, review },
                              )
                            : NO_RESULTS_RETRY_PROMPT;
                        return {
                            result,
                            metadata: {
                                status: 'success' as const,
                                queryCacheHit:
                                    queryResults.cacheMetadata?.cacheHit ===
                                    true,
                            },
                            structuredContent: {
                                outcome: 'noResults',
                                review: reviewQuery ? result : null,
                            },
                        };
                    }

                    const csv = convertQueryResultsToCsv(
                        queryResults,
                        maxContextRows,
                    );
                    const table = buildShownTable(queryResults, maxContextRows);
                    const truncationNote = getContextTruncationNote({
                        rowCount: queryResults.rows.length,
                        maxContextRows,
                    });
                    return {
                        result: `${buildSavedChartHeader(
                            uuid,
                            name,
                            queryResults.execution.metricQuery,
                            {
                                includeFullSpec: true,
                            },
                        )}${truncationNote}${serializeData(csv, 'csv')}${review}`,
                        metadata: {
                            status: 'success' as const,
                            queryCacheHit:
                                queryResults.cacheMetadata?.cacheHit === true,
                        },
                        structuredContent: {
                            outcome: 'rows',
                            chart: describeSavedChartSpec(
                                uuid,
                                name,
                                queryResults.execution.metricQuery,
                            ),
                            ...table,
                            review: review === '' ? null : review,
                            truncationNote:
                                truncationNote === '' ? null : truncationNote,
                        },
                    };
                }

                const rawMetricQuery = source.metricQuery as Partial<
                    AiMetricQueryWithFilters & { limit: number | null }
                >;
                const metricQuery = {
                    dimensions: [],
                    metrics: [],
                    sorts: [],
                    tableCalculations: [],
                    additionalMetrics: [],
                    customMetrics: null,
                    ...rawMetricQuery,
                    exploreName: rawMetricQuery.exploreName ?? source.tableName,
                    filters: (rawMetricQuery.filters ?? {}) as Filters,
                    limit: getValidAiQueryLimit(
                        rawMetricQuery.limit ?? null,
                        maxLimit,
                    ),
                } as AiMetricQueryWithFilters;

                validateContent({
                    type: 'chart',
                    content: {
                        name: 'Query',
                        slug: 'query',
                        description: null,
                        tableName: source.tableName,
                        spaceSlug: 'agent-suggestions',
                        version: 1,
                        chartConfig: { type: 'table', config: {} },
                        tableConfig: { columnOrder: [] },
                        dashboardSlug: undefined,
                        pivotConfig: undefined,
                        parameters: source.parameters ?? undefined,
                        metricQuery,
                    } as unknown as ChartAsCode,
                });

                if (!enableDataAccess) {
                    return {
                        result: 'Data access is disabled for this agent. The metric query shape is valid, but row values cannot be returned.',
                        metadata: {
                            status: 'success' as const,
                        },
                        structuredContent: {
                            outcome: 'dataAccessDisabled',
                            chart: null,
                        },
                    };
                }

                const [queryResults, review] = await Promise.all([
                    runAsyncQuery(
                        metricQuery,
                        undefined,
                        source.parameters
                            ? (source.parameters as ParametersValuesMap)
                            : undefined,
                    ),
                    reviewQuery?.({
                        kind: 'semantic',
                        query: metricQuery,
                        parameters: source.parameters
                            ? (source.parameters as ParametersValuesMap)
                            : undefined,
                    }) ?? '',
                ]);

                if (queryResults.rows.length === 0) {
                    const result = reviewQuery
                        ? await reviewQuery(
                              {
                                  kind: 'semantic',
                                  query: metricQuery,
                                  parameters: source.parameters
                                      ? (source.parameters as ParametersValuesMap)
                                      : undefined,
                              },
                              { emptyResult: true, review },
                          )
                        : NO_RESULTS_RETRY_PROMPT;
                    return {
                        result,
                        metadata: {
                            status: 'success' as const,
                            queryCacheHit:
                                queryResults.cacheMetadata?.cacheHit === true,
                        },
                        structuredContent: {
                            outcome: 'noResults',
                            review: reviewQuery ? result : null,
                        },
                    };
                }

                const table = buildShownTable(queryResults, maxContextRows);
                const truncationNote = getContextTruncationNote({
                    rowCount: queryResults.rows.length,
                    maxContextRows,
                });
                return {
                    result: `${truncationNote}${serializeData(
                        convertQueryResultsToCsv(queryResults, maxContextRows),
                        'csv',
                    )}${review}`,
                    metadata: {
                        status: 'success' as const,
                        queryCacheHit:
                            queryResults.cacheMetadata?.cacheHit === true,
                    },
                    structuredContent: {
                        outcome: 'rows',
                        chart: null,
                        ...table,
                        columns: table.columns.map(({ label }) => ({
                            fieldId: null,
                            label,
                        })),
                        rows: table.rows.map((row) =>
                            table.columns.map(({ fieldId }) => row[fieldId]),
                        ),
                        review: review === '' ? null : review,
                        truncationNote:
                            truncationNote === '' ? null : truncationNote,
                    },
                };
            } catch (error) {
                return toolErrorOutput(error, 'Error running content query.');
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
};
