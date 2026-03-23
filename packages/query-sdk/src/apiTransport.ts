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

const POLL_INTERVAL_MS = 500;
const MAX_POLL_ATTEMPTS = 120; // 60 seconds max

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

async function apiFetch<T>(
    config: LightdashClientConfig,
    method: string,
    path: string,
    body?: unknown,
): Promise<T> {
    // Use relative paths when a proxy is available (dev server),
    // or the full base URL when calling the API directly (production).
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
}

function mapColumnType(type: string): Column['type'] {
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

export function createApiTransport(config: LightdashClientConfig): Transport {
    return {
        async executeQuery(query: QueryDefinition): Promise<QueryResult> {
            const table = query.exploreName;

            // Lightdash field IDs are `{table}_{column}`.
            // The SDK lets users write short names like 'driver_name'
            // and we qualify them to 'fct_race_results_driver_name'.
            const qualify = (fieldId: string) =>
                fieldId.startsWith(`${table}_`)
                    ? fieldId
                    : `${table}_${fieldId}`;

            const qualifiedDims = query.dimensions.map(qualify);
            const qualifiedMetrics = query.metrics.map(qualify);

            // Step 1: Execute async query
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
                    tableCalculations: [],
                },
            };

            const execResult = await apiFetch<AsyncQueryResponse>(
                config,
                'POST',
                `/api/v2/projects/${config.projectUuid}/query/metric-query`,
                body,
            );

            const { queryUuid, fields } = execResult;

            // Step 2: Poll for results
            let attempts = 0;
            while (attempts < MAX_POLL_ATTEMPTS) {
                const pollResult = await apiFetch<PollResponse>(
                    config,
                    'GET',
                    `/api/v2/projects/${config.projectUuid}/query/${queryUuid}`,
                );

                if (pollResult.status === 'ready') {
                    // Build a mapping from qualified → short field names
                    // so app code uses row.driver_name, not row.fct_race_results_driver_name
                    const allShort = [...query.dimensions, ...query.metrics];
                    const allQualified = [
                        ...qualifiedDims,
                        ...qualifiedMetrics,
                    ];
                    const qualifiedToShort = new Map<string, string>();
                    for (let i = 0; i < allShort.length; i++) {
                        qualifiedToShort.set(allQualified[i], allShort[i]);
                    }

                    // Map columns from field metadata
                    const columns: Column[] = allQualified.map((qFieldId) => {
                        const shortName =
                            qualifiedToShort.get(qFieldId) ?? qFieldId;
                        const fieldMeta = fields[qFieldId];
                        const colMeta = pollResult.columns[qFieldId];
                        return {
                            name: shortName,
                            label: fieldMeta?.label ?? shortName,
                            type: mapColumnType(
                                colMeta?.type ?? fieldMeta?.type ?? 'string',
                            ),
                        };
                    });

                    // Map rows: extract raw values, keep formatted for format()
                    const formattedCache = new Map<
                        string,
                        Map<unknown, string>
                    >();

                    const rows: Row[] = pollResult.rows.map((apiRow) => {
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

                // Still running — wait and retry
                // eslint-disable-next-line no-promise-executor-return
                await new Promise((resolve) =>
                    setTimeout(resolve, POLL_INTERVAL_MS),
                );
                attempts++;
            }

            throw new Error('Query timed out waiting for results');
        },

        async getUser(): Promise<LightdashUser> {
            const user = await apiFetch<{
                userUuid: string;
                firstName: string;
                lastName: string;
                email: string;
                role: string;
                organizationUuid: string;
                userAttributes?: Record<string, string>;
            }>(config, 'GET', '/api/v1/user');

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
