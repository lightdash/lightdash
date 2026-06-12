/**
 * API transport — executes queries against the real Lightdash async metrics endpoint.
 *
 * Flow:
 * 1. POST /api/v2/projects/{projectUuid}/query/metric-query
 *    → returns { queryUuid }
 * 2. Poll GET /api/v2/projects/{projectUuid}/query/{queryUuid}
 *    → returns results when status is 'ready'
 */

import type {
    Column,
    DownloadResultsFileType,
    DownloadResultsLimit,
    DownloadResultsOptions,
    DownloadResultsResult,
    FormatFunction,
    InternalFilterDefinition,
    LightdashClientConfig,
    LightdashUser,
    QueryDefinition,
    QueryResult,
    Row,
    Transport,
    UnderlyingDataOptions,
    UnderlyingDataResult,
} from './types';

// Mirrors the explorer's `useInfiniteQueryResults` polling rhythm so the
// SDK behaves like a normal Lightdash chart: 500-row pages, exponential
// backoff starting at 250ms, capped at 1000ms.
const PAGE_SIZE = 500;
const INITIAL_BACKOFF_MS = 250;
const MAX_BACKOFF_MS = 1000;
const MAX_POLL_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const MAX_DOWNLOAD_POLL_DURATION_MS = 10 * 60 * 1000; // 10 minutes
const ALL_RESULTS_LIMIT = Number.MAX_SAFE_INTEGER;

type ApiResponse<T> = {
    status: 'ok';
    results: T;
};

type AsyncQueryResponse = {
    queryUuid: string;
    metricQuery: Record<string, unknown>;
    fields: Record<string, FieldMeta>;
};

type ScheduleDownloadResponse = {
    jobId: string;
};

type SchedulerJobStatusResponse = {
    status: 'scheduled' | 'started' | 'completed' | 'error';
    details?: {
        fileUrl?: string;
        truncated?: boolean;
        error?: string;
        [key: string]: unknown;
    } | null;
};

type FieldMeta = {
    fieldType: 'dimension' | 'metric' | 'table_calculation';
    type: string;
    label?: string;
    format?: string;
    round?: number;
    compact?: string;
    [key: string]: unknown;
};

type ResultValue = {
    raw: unknown;
    formatted: string;
};

type ResultRow = Record<string, { value: ResultValue }>;

type ApiFilters = Record<string, unknown>;

type PollResponse =
    | {
          status: 'ready';
          queryUuid: string;
          columns: Record<string, { reference: string; type: string }>;
          rows: ResultRow[];
          // Pagination — backend tells us the next page number, or undefined
          // when this is the last page. totalResults lets us short-circuit
          // when the warehouse returned fewer rows than the last fetched
          // page could hold.
          nextPage?: number;
          totalResults: number;
      }
    | {
          status: 'pending' | 'queued' | 'executing' | 'cancelled';
          queryUuid: string;
      }
    | {
          status: 'error' | 'expired';
          queryUuid: string;
          error: string | null;
      };

const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
    });

/**
 * A function that performs HTTP requests and returns parsed JSON results.
 * The default implementation uses `Authorization: ApiKey` header.
 * Supply a custom adapter to use session cookies or other auth mechanisms.
 */
export type FetchAdapter = <T>(
    method: string,
    path: string,
    body?: unknown,
    metadata?: Record<string, unknown>,
) => Promise<T>;

/**
 * Convert SDK filter definitions into the Lightdash API filter format.
 * The API expects { dimensions: { id, and: [...rules] } }
 */
function buildApiFilters(filters: InternalFilterDefinition[]): ApiFilters {
    if (filters.length === 0) {
        return {};
    }

    // For now, all filters are AND-ed on dimensions.
    // TODO: support metric filters and OR groups
    const rules = filters.map((f, i) => ({
        id: `sdk-filter-${i}`,
        target: { fieldId: f.fieldId },
        operator: f.operator,
        values: f.values,
        ...(f.settings ? { settings: f.settings } : {}),
    }));

    return {
        dimensions: {
            id: 'sdk-root',
            and: rules,
        },
    };
}

const createFieldQualifier =
    (table: string) =>
    (fieldId: string): string => {
        // Dot notation: 'customers.name' -> 'customers_name'
        if (fieldId.includes('.')) {
            return fieldId.replace('.', '_');
        }
        // Already qualified with explore name
        if (fieldId.startsWith(`${table}_`)) {
            return fieldId;
        }
        // Short name -> qualify with explore name
        return `${table}_${fieldId}`;
    };

function buildUnderlyingDataFilters(
    query: QueryDefinition,
    row: Row,
    qualify: (fieldId: string) => string,
): ApiFilters {
    const sourceFilters = buildApiFilters(
        query.filters.map((f) => ({
            ...f,
            fieldId: qualify(f.fieldId),
        })),
    );

    const rowFilters = query.dimensions.map((dimension, i) => {
        if (!Object.prototype.hasOwnProperty.call(row, dimension)) {
            throw new Error(
                `Cannot fetch underlying data because the row is missing dimension "${dimension}". Pass the original row returned by useLightdash().`,
            );
        }

        const value = row[dimension];
        return {
            id: `sdk-underlying-row-filter-${i}`,
            target: { fieldId: qualify(dimension) },
            operator: value === null ? 'isNull' : 'equals',
            ...(value === null ? {} : { values: [value] }),
        };
    });

    if (!sourceFilters.dimensions && rowFilters.length === 0) {
        return {};
    }

    return {
        dimensions: {
            id: 'sdk-underlying-root',
            and: [
                ...(sourceFilters.dimensions ? [sourceFilters.dimensions] : []),
                ...rowFilters,
            ],
        },
    };
}

function createDefaultFetchAdapter(
    config: LightdashClientConfig,
): FetchAdapter {
    return async <T>(
        method: string,
        path: string,
        body?: unknown,
    ): Promise<T> => {
        const useProxy = config.useProxy ?? false;
        const baseUrl = useProxy ? '' : config.baseUrl.replace(/\/$/, '');
        const url = `${baseUrl}${path}`;
        const res = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `ApiKey ${config.apiKey}`,
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
        });

        if (!res.ok) {
            const text = await res.text();
            let message: string;
            try {
                const parsed = JSON.parse(text);
                message = parsed.error?.message ?? parsed.message ?? text;
            } catch {
                message = text;
            }
            throw new Error(`Lightdash API error (${res.status}): ${message}`);
        }

        const json = (await res.json()) as ApiResponse<T>;
        return json.results;
    };
}

function buildMetricQueryBody(
    query: QueryDefinition,
    qualify: (fieldId: string) => string,
    limit: number = query.limit,
): Record<string, unknown> {
    return {
        query: {
            exploreName: query.exploreName,
            dimensions: query.dimensions.map(qualify),
            metrics: query.metrics.map(qualify),
            filters: buildApiFilters(
                query.filters.map((f) => ({
                    ...f,
                    fieldId: qualify(f.fieldId),
                })),
            ),
            sorts: query.sorts.map((s) => ({
                fieldId: qualify(s.fieldId),
                descending: s.descending,
            })),
            limit,
            tableCalculations: query.tableCalculations,
            ...(query.additionalMetrics.length > 0
                ? { additionalMetrics: query.additionalMetrics }
                : {}),
            ...(query.customDimensions.length > 0
                ? { customDimensions: query.customDimensions }
                : {}),
        },
        // Parameters go at the TOP LEVEL of the body — the backend reads
        // `body.parameters`, not `body.query.parameters`.
        ...(query.parameters && Object.keys(query.parameters).length > 0
            ? { parameters: query.parameters }
            : {}),
    };
}

async function executeMetricQuery(
    fetchFn: FetchAdapter,
    projectUuid: string,
    query: QueryDefinition,
    qualify: (fieldId: string) => string,
    limit?: number,
): Promise<AsyncQueryResponse> {
    const metadata = query.label ? { label: query.label } : undefined;
    return fetchFn<AsyncQueryResponse>(
        'POST',
        `/api/v2/projects/${projectUuid}/query/metric-query`,
        buildMetricQueryBody(query, qualify, limit),
        metadata,
    );
}

function getDownloadLimit(limit: DownloadResultsLimit | undefined): {
    kind: 'table' | 'rerun';
    limit?: number;
} {
    if (limit === undefined || limit === 'table') {
        return { kind: 'table' };
    }
    if (limit === 'all') {
        return { kind: 'rerun', limit: ALL_RESULTS_LIMIT };
    }
    if (!Number.isInteger(limit) || limit < 1) {
        throw new Error(
            'Download limit must be "table", "all", or a positive integer.',
        );
    }
    return { kind: 'rerun', limit };
}

const triggerBrowserDownload = (
    fileUrl: string,
    filename: string | undefined,
    fileType: DownloadResultsFileType,
) => {
    if (typeof document === 'undefined') return;

    const link = document.createElement('a');
    link.href = fileUrl;
    if (filename) {
        link.download = filename.toLowerCase().endsWith(`.${fileType}`)
            ? filename
            : `${filename}.${fileType}`;
    }
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

export function mapColumnType(type: string): Column['type'] {
    if (/timestamp/i.test(type)) return 'timestamp';
    if (/date/i.test(type)) return 'date';
    if (
        /number|int|float|average|count|sum|min|max|median|percentile/i.test(
            type,
        )
    )
        return 'number';
    if (/boolean/i.test(type)) return 'boolean';
    return 'string';
}

async function pollQueryReady(
    fetchFn: FetchAdapter,
    projectUuid: string,
    queryUuid: string,
    pageSize: number = PAGE_SIZE,
): Promise<Extract<PollResponse, { status: 'ready' }>> {
    const pollUrl = (page: number) =>
        `/api/v2/projects/${projectUuid}/query/${queryUuid}?page=${page}&pageSize=${pageSize}`;

    // The poll endpoint returns status PENDING/QUEUED/EXECUTING while
    // the warehouse is still running, and READY once results are available.
    const deadline = Date.now() + MAX_POLL_DURATION_MS;
    let backoffMs = INITIAL_BACKOFF_MS;

    while (Date.now() < deadline) {
        const pollResult = await fetchFn<PollResponse>('GET', pollUrl(1));

        if (pollResult.status === 'ready') {
            return pollResult;
        }

        if (pollResult.status === 'error' || pollResult.status === 'expired') {
            throw new Error(
                `Query failed: ${pollResult.error ?? 'unknown error'}`,
            );
        }

        if (pollResult.status === 'cancelled') {
            throw new Error('Query was cancelled');
        }

        // Still running — wait with exponential backoff and retry.
        const sleepMs = backoffMs;
        await sleep(sleepMs);
        backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
    }

    throw new Error('Query timed out waiting for results');
}

async function pollQueryRows(
    fetchFn: FetchAdapter,
    projectUuid: string,
    queryUuid: string,
): Promise<{
    firstReadyPage: Extract<PollResponse, { status: 'ready' }>;
    apiRows: ResultRow[];
}> {
    const pollUrl = (page: number) =>
        `/api/v2/projects/${projectUuid}/query/${queryUuid}?page=${page}&pageSize=${PAGE_SIZE}`;

    const firstReadyPage = await pollQueryReady(
        fetchFn,
        projectUuid,
        queryUuid,
    );
    const apiRows: ResultRow[] = [...firstReadyPage.rows];

    // Drain remaining pages. The backend already streamed results to S3 by
    // the time the first page is ready, so subsequent pages resolve quickly.
    let { nextPage } = firstReadyPage;
    const { totalResults } = firstReadyPage;
    while (nextPage !== undefined && apiRows.length < totalResults) {
        const pageResult = await fetchFn<PollResponse>(
            'GET',
            pollUrl(nextPage),
        );

        if (pageResult.status !== 'ready') {
            throw new Error(
                `Unexpected status while paginating results: ${pageResult.status}`,
            );
        }

        apiRows.push(...pageResult.rows);
        nextPage = pageResult.nextPage;
    }

    return { firstReadyPage, apiRows };
}

async function pollDownloadJob(
    fetchFn: FetchAdapter,
    jobId: string,
): Promise<{ fileUrl: string; truncated: boolean }> {
    const deadline = Date.now() + MAX_DOWNLOAD_POLL_DURATION_MS;

    while (Date.now() < deadline) {
        const result = await fetchFn<SchedulerJobStatusResponse>(
            'GET',
            `/api/v1/schedulers/job/${jobId}/status`,
        );

        if (result.status === 'completed') {
            const fileUrl = result.details?.fileUrl;
            if (!fileUrl) {
                throw new Error('Download completed without a file URL.');
            }
            return {
                fileUrl,
                truncated: result.details?.truncated === true,
            };
        }

        if (result.status === 'error') {
            throw new Error(result.details?.error ?? 'Download failed.');
        }

        await sleep(2000);
    }

    throw new Error('Download timed out waiting for the export job.');
}

function mapApiRowsToQueryResult({
    apiRows,
    columns,
    fields,
    fieldIds,
    fieldNameForId,
}: {
    apiRows: ResultRow[];
    columns: Record<string, { reference: string; type: string }>;
    fields: Record<string, FieldMeta>;
    fieldIds: string[];
    fieldNameForId: (fieldId: string) => string;
}): Pick<QueryResult, 'rows' | 'columns' | 'format'> {
    const idToName = new Map<string, string>();
    for (const fieldId of fieldIds) {
        idToName.set(fieldId, fieldNameForId(fieldId));
    }

    const resultColumns: Column[] = fieldIds.map((fieldId) => {
        const name = idToName.get(fieldId) ?? fieldId;
        const fieldMeta = fields[fieldId];
        const colMeta = columns[fieldId];
        return {
            name,
            label: fieldMeta?.label ?? name,
            type: mapColumnType(colMeta?.type ?? fieldMeta?.type ?? 'string'),
        };
    });

    const formattedCache = new Map<string, Map<unknown, string>>();

    const rows: Row[] = apiRows.map((apiRow) => {
        const row: Row = {};
        for (const fieldId of fieldIds) {
            const name = idToName.get(fieldId) ?? fieldId;
            const cell = apiRow[fieldId];
            if (!cell) {
                row[name] = null;
                continue;
            }
            const { raw, formatted } = cell.value;

            if (!formattedCache.has(name)) {
                formattedCache.set(name, new Map());
            }
            formattedCache.get(name)!.set(raw, formatted);

            if (raw === null || raw === undefined) {
                row[name] = null;
            } else if (typeof raw === 'number') {
                row[name] = raw;
            } else if (typeof raw === 'boolean') {
                row[name] = raw;
            } else {
                row[name] = String(raw);
            }
        }
        return row;
    });

    const format: FormatFunction = (row, fieldId) => {
        const rawVal = row[fieldId];
        const cache = formattedCache.get(fieldId);
        if (cache) {
            const formatted = cache.get(rawVal);
            if (formatted !== undefined) return formatted;
        }
        return String(rawVal ?? '');
    };

    return { rows, columns: resultColumns, format };
}

/**
 * Creates a transport that executes queries via the Lightdash REST API.
 *
 * @param config - Client configuration (projectUuid is required; apiKey/baseUrl
 *   are used by the default fetch adapter but ignored when a custom adapter is provided)
 * @param adapter - Optional custom fetch adapter. When omitted, uses the default
 *   adapter that authenticates via `Authorization: ApiKey` header.
 */
export function createApiTransport(
    config: LightdashClientConfig,
    adapter?: FetchAdapter,
): Transport {
    const fetchFn = adapter ?? createDefaultFetchAdapter(config);

    return {
        async executeQuery(query: QueryDefinition): Promise<QueryResult> {
            const table = query.exploreName;
            const qualify = createFieldQualifier(table);

            const qualifiedDims = query.dimensions.map(qualify);
            const qualifiedMetrics = query.metrics.map(qualify);

            // Kick off the async query — returns a queryUuid we then poll.
            const execResult = await executeMetricQuery(
                fetchFn,
                config.projectUuid,
                query,
                qualify,
            );

            const { queryUuid, fields } = execResult;

            // Build a mapping from qualified → short field names
            // so app code uses row.driver_name, not row.fct_race_results_driver_name
            const allShort = [...query.dimensions, ...query.metrics];
            const allQualified = [...qualifiedDims, ...qualifiedMetrics];
            const qualifiedToShort = new Map<string, string>();
            for (let i = 0; i < allShort.length; i++) {
                qualifiedToShort.set(allQualified[i], allShort[i]);
            }

            const { firstReadyPage, apiRows } = await pollQueryRows(
                fetchFn,
                config.projectUuid,
                queryUuid,
            );

            const mappedResult = mapApiRowsToQueryResult({
                apiRows,
                columns: firstReadyPage.columns,
                fields,
                fieldIds: allQualified,
                fieldNameForId: (fieldId) =>
                    qualifiedToShort.get(fieldId) ?? fieldId,
            });

            const getUnderlyingData = async (
                options: UnderlyingDataOptions,
            ): Promise<UnderlyingDataResult> => {
                const metricId = qualify(options.metric);
                if (!qualifiedMetrics.includes(metricId)) {
                    throw new Error(
                        `Cannot fetch underlying data for "${options.metric}" because it is not a metric in the source query.`,
                    );
                }

                const underlyingExecResult = await fetchFn<AsyncQueryResponse>(
                    'POST',
                    `/api/v2/projects/${config.projectUuid}/query/underlying-data`,
                    {
                        context: 'viewUnderlyingData',
                        underlyingDataSourceQueryUuid: queryUuid,
                        underlyingDataItemId: metricId,
                        filters: buildUnderlyingDataFilters(
                            query,
                            options.row,
                            qualify,
                        ),
                        ...(options.limit !== undefined
                            ? { limit: options.limit }
                            : {}),
                        ...(query.parameters &&
                        Object.keys(query.parameters).length > 0
                            ? { parameters: query.parameters }
                            : {}),
                    },
                );

                const {
                    firstReadyPage: underlyingFirstReadyPage,
                    apiRows: underlyingApiRows,
                } = await pollQueryRows(
                    fetchFn,
                    config.projectUuid,
                    underlyingExecResult.queryUuid,
                );

                const underlyingFieldIds = [
                    ...Object.keys(underlyingExecResult.fields),
                    ...Object.keys(underlyingFirstReadyPage.columns).filter(
                        (fieldId) => !(fieldId in underlyingExecResult.fields),
                    ),
                ];

                return {
                    ...mapApiRowsToQueryResult({
                        apiRows: underlyingApiRows,
                        columns: underlyingFirstReadyPage.columns,
                        fields: underlyingExecResult.fields,
                        fieldIds: underlyingFieldIds,
                        fieldNameForId: (fieldId) => fieldId,
                    }),
                    queryUuid: underlyingExecResult.queryUuid,
                };
            };

            const downloadResults = async (
                options: DownloadResultsOptions = {},
            ): Promise<DownloadResultsResult> => {
                const fileType = options.fileType ?? 'csv';
                if (fileType !== 'csv' && fileType !== 'xlsx') {
                    throw new Error(
                        'Download fileType must be "csv" or "xlsx".',
                    );
                }

                const values = options.values ?? 'formatted';
                if (values !== 'formatted' && values !== 'raw') {
                    throw new Error(
                        'Download values must be "formatted" or "raw".',
                    );
                }

                const downloadLimit = getDownloadLimit(options.limit);
                let downloadQueryUuid = queryUuid;

                if (downloadLimit.kind === 'rerun') {
                    const downloadExecResult = await executeMetricQuery(
                        fetchFn,
                        config.projectUuid,
                        query,
                        qualify,
                        downloadLimit.limit,
                    );
                    await pollQueryReady(
                        fetchFn,
                        config.projectUuid,
                        downloadExecResult.queryUuid,
                        1,
                    );
                    downloadQueryUuid = downloadExecResult.queryUuid;
                }

                const scheduled = await fetchFn<ScheduleDownloadResponse>(
                    'POST',
                    `/api/v2/projects/${config.projectUuid}/query/${downloadQueryUuid}/schedule-download`,
                    {
                        type: fileType,
                        onlyRaw: values === 'raw',
                        ...(options.filename
                            ? { attachmentDownloadName: options.filename }
                            : {}),
                    },
                );

                const { fileUrl, truncated } = await pollDownloadJob(
                    fetchFn,
                    scheduled.jobId,
                );

                if (options.autoDownload !== false) {
                    triggerBrowserDownload(fileUrl, options.filename, fileType);
                }

                return {
                    queryUuid: downloadQueryUuid,
                    jobId: scheduled.jobId,
                    fileUrl,
                    fileType,
                    truncated,
                };
            };

            return {
                ...mappedResult,
                totalResults: firstReadyPage.totalResults,
                queryUuid,
                getUnderlyingData,
                downloadResults,
            };
        },

        async getUser(): Promise<LightdashUser> {
            const user = await fetchFn<{
                userUuid: string;
                firstName: string;
                lastName: string;
                email: string;
                role: string;
                organizationUuid: string;
                userAttributes?: Record<string, string>;
            }>('GET', '/api/v1/user');

            return {
                name: `${user.firstName} ${user.lastName}`.trim(),
                email: user.email,
                role: user.role,
                orgId: user.organizationUuid,
                attributes: user.userAttributes ?? {},
            };
        },
    };
}
