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
    FormatFunction,
    InternalFilterDefinition,
    LightdashClientConfig,
    LightdashUser,
    QueryDefinition,
    QueryResult,
    Row,
    Transport,
} from './types';

// Mirrors the explorer's `useInfiniteQueryResults` polling rhythm so the
// SDK behaves like a normal Lightdash chart: 500-row pages, exponential
// backoff starting at 250ms, capped at 1000ms.
const PAGE_SIZE = 500;
const INITIAL_BACKOFF_MS = 250;
const MAX_BACKOFF_MS = 1000;
const MAX_POLL_DURATION_MS = 5 * 60 * 1000; // 5 minutes

type ApiResponse<T> = {
    status: 'ok';
    results: T;
};

type AsyncQueryResponse = {
    queryUuid: string;
    metricQuery: Record<string, unknown>;
    fields: Record<string, FieldMeta>;
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
function buildApiFilters(
    filters: InternalFilterDefinition[],
): Record<string, unknown> {
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

function createDefaultFetchAdapter(config: LightdashClientConfig): FetchAdapter {
    return async <T>(method: string, path: string, body?: unknown): Promise<T> => {
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
            throw new Error(
                `Lightdash API error (${res.status}): ${message}`,
            );
        }

        const json = (await res.json()) as ApiResponse<T>;
        return json.results;
    };
}

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

            // Lightdash field IDs are `{table}_{column}`.
            // The SDK lets users write short names like 'driver_name'
            // and we qualify them to 'fct_race_results_driver_name'.
            //
            // For joined table fields, use dot notation: 'customers.name'
            // which resolves to 'customers_name' (not 'orders_customers_name').
            const qualify = (fieldId: string): string => {
                // Dot notation: 'customers.name' → 'customers_name'
                if (fieldId.includes('.')) {
                    return fieldId.replace('.', '_');
                }
                // Already qualified with explore name
                if (fieldId.startsWith(`${table}_`)) {
                    return fieldId;
                }
                // Short name → qualify with explore name
                return `${table}_${fieldId}`;
            };

            const qualifiedDims = query.dimensions.map(qualify);
            const qualifiedMetrics = query.metrics.map(qualify);

            // Kick off the async query — returns a queryUuid we then poll.
            const body = {
                query: {
                    exploreName: table,
                    dimensions: qualifiedDims,
                    metrics: qualifiedMetrics,
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
                    limit: query.limit,
                    tableCalculations: query.tableCalculations,
                    ...(query.additionalMetrics.length > 0
                        ? { additionalMetrics: query.additionalMetrics }
                        : {}),
                    ...(query.customDimensions.length > 0
                        ? { customDimensions: query.customDimensions }
                        : {}),
                },
            };

            // Pass label as transport metadata (not in the API body)
            // so the parent bridge can display it in the query inspector.
            const metadata = query.label
                ? { label: query.label }
                : undefined;

            const execResult = await fetchFn<AsyncQueryResponse>(
                'POST',
                `/api/v2/projects/${config.projectUuid}/query/metric-query`,
                body,
                metadata,
            );

            const { queryUuid, fields } = execResult;

            const pollUrl = (page: number) =>
                `/api/v2/projects/${config.projectUuid}/query/${queryUuid}?page=${page}&pageSize=${PAGE_SIZE}`;

            // The poll endpoint returns status PENDING/QUEUED/EXECUTING while
            // the warehouse is still running, and READY (with the first page
            // of rows) once results are available. Mirrors the explorer's
            // `useInfiniteQueryResults`: backoff while waiting, then follow
            // `nextPage` to drain remaining pages.
            const deadline = Date.now() + MAX_POLL_DURATION_MS;
            let backoffMs = INITIAL_BACKOFF_MS;
            let firstReadyPage:
                | Extract<PollResponse, { status: 'ready' }>
                | null = null;
            const apiRows: ResultRow[] = [];

            // Wait for the first ready page.
            while (Date.now() < deadline) {
                const pollResult = await fetchFn<PollResponse>(
                    'GET',
                    pollUrl(1),
                );

                if (pollResult.status === 'ready') {
                    firstReadyPage = pollResult;
                    apiRows.push(...pollResult.rows);
                    backoffMs = INITIAL_BACKOFF_MS;
                    break;
                }

                if (
                    pollResult.status === 'error' ||
                    pollResult.status === 'expired'
                ) {
                    throw new Error(
                        `Query failed: ${pollResult.error ?? 'unknown error'}`,
                    );
                }

                if (pollResult.status === 'cancelled') {
                    throw new Error('Query was cancelled');
                }

                // Still running — wait with exponential backoff and retry.
                const sleepMs = backoffMs;
                // eslint-disable-next-line no-promise-executor-return
                await new Promise((resolve) => setTimeout(resolve, sleepMs));
                backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
            }

            if (!firstReadyPage) {
                throw new Error('Query timed out waiting for results');
            }

            // Drain remaining pages. The backend already streamed results to
            // S3 by the time the first page is ready, so subsequent pages
            // resolve quickly (no warehouse round-trip per page).
            let { nextPage } = firstReadyPage;
            const { totalResults } = firstReadyPage;
            while (
                nextPage !== undefined &&
                apiRows.length < totalResults
            ) {
                const pageResult = await fetchFn<PollResponse>(
                    'GET',
                    pollUrl(nextPage),
                );

                if (pageResult.status !== 'ready') {
                    // Status shouldn't regress once we've seen ready; treat
                    // anything else as a hard failure rather than retrying.
                    throw new Error(
                        `Unexpected status while paginating results: ${pageResult.status}`,
                    );
                }

                apiRows.push(...pageResult.rows);
                nextPage = pageResult.nextPage;
            }

            // Build a mapping from qualified → short field names
            // so app code uses row.driver_name, not row.fct_race_results_driver_name
            const allShort = [...query.dimensions, ...query.metrics];
            const allQualified = [...qualifiedDims, ...qualifiedMetrics];
            const qualifiedToShort = new Map<string, string>();
            for (let i = 0; i < allShort.length; i++) {
                qualifiedToShort.set(allQualified[i], allShort[i]);
            }

            // Map columns from field metadata
            const columns: Column[] = allQualified.map((qFieldId) => {
                const shortName = qualifiedToShort.get(qFieldId) ?? qFieldId;
                const fieldMeta = fields[qFieldId];
                const colMeta = firstReadyPage.columns[qFieldId];
                return {
                    name: shortName,
                    label: fieldMeta?.label ?? shortName,
                    type: mapColumnType(
                        colMeta?.type ?? fieldMeta?.type ?? 'string',
                    ),
                };
            });

            // Map rows: extract raw values, keep formatted for format()
            const formattedCache = new Map<string, Map<unknown, string>>();

            const rows: Row[] = apiRows.map((apiRow) => {
                const row: Row = {};
                for (const qFieldId of allQualified) {
                    const shortName =
                        qualifiedToShort.get(qFieldId) ?? qFieldId;
                    const cell = apiRow[qFieldId];
                    if (!cell) {
                        row[shortName] = null;
                        continue;
                    }
                    const { raw, formatted } = cell.value;

                    // Store formatted value for the format() function
                    if (!formattedCache.has(shortName)) {
                        formattedCache.set(shortName, new Map());
                    }
                    formattedCache.get(shortName)!.set(raw, formatted);

                    // Convert raw to typed value
                    if (raw === null || raw === undefined) {
                        row[shortName] = null;
                    } else if (typeof raw === 'number') {
                        row[shortName] = raw;
                    } else if (typeof raw === 'boolean') {
                        row[shortName] = raw;
                    } else {
                        row[shortName] = String(raw);
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

            return { rows, columns, format };
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
