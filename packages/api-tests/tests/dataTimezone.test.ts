import { SEED_PROJECT } from '@lightdash/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiClient, Body } from '../helpers/api-client';
import { login } from '../helpers/auth';

const apiUrl = '/api/v2';
const projectUuid = SEED_PROJECT.project_uuid;

/**
 * Data timezone tests.
 *
 * Uses the `timezone_test` model which has 10 events with timestamptz values
 * at specific UTC times. When the warehouse session timezone changes (via
 * dataTimezone on credentials), DATE_TRUNC day boundaries shift, producing
 * different per-day counts.
 *
 * Expected counts by day (no filter):
 *   UTC (default):              Jan 15 = 6, Jan 16 = 4
 *   Pacific/Pago_Pago (UTC-11): Jan 14 = 4, Jan 15 = 4, Jan 16 = 2
 *
 * Expected counts with "equals Jan 15" filter:
 *   UTC: 6
 *   Pacific/Pago_Pago: 4
 *
 * Requires LIGHTDASH_ENABLE_TIMEZONE_SUPPORT=true in the environment.
 */

let admin: ApiClient;

async function getProjectConfig(client: ApiClient): Promise<{
    dbtConnection: Record<string, unknown>;
    warehouseConnection: Record<string, unknown>;
}> {
    const resp = await client.request<
        Body<{
            dbtConnection: Record<string, unknown>;
            warehouseConnection: Record<string, unknown>;
        }>
    >(`/api/v1/projects/${projectUuid}`);
    expect(resp.status).toBe(200);
    return {
        dbtConnection: resp.body.results.dbtConnection,
        warehouseConnection: resp.body.results.warehouseConnection,
    };
}

async function updateDataTimezone(
    client: ApiClient,
    dataTimezone?: string,
): Promise<void> {
    const { dbtConnection, warehouseConnection } =
        await getProjectConfig(client);
    const resp = await client.request(`/api/v1/projects/${projectUuid}`, {
        method: 'PATCH',
        body: {
            dbtConnection,
            warehouseConnection: {
                ...warehouseConnection,
                dataTimezone: dataTimezone ?? null,
            },
        },
    });
    expect(resp.status).toBe(200);
}

async function runAsyncQuery(
    client: ApiClient,
    options: {
        dimensions: string[];
        metrics: string[];
        filters?: Record<string, unknown>;
        sorts?: Array<{ fieldId: string; descending: boolean }>;
    },
): Promise<
    Array<Record<string, { value: { raw: string; formatted: string } }>>
> {
    // Start the query
    const startResp = await client.request<Body<{ queryUuid: string }>>(
        `${apiUrl}/projects/${projectUuid}/query/metric-query`,
        {
            method: 'POST',
            body: {
                query: {
                    exploreName: 'timezone_test',
                    dimensions: options.dimensions,
                    metrics: options.metrics,
                    filters: options.filters ?? {},
                    sorts: options.sorts ?? [
                        {
                            fieldId: options.dimensions[0],
                            descending: false,
                        },
                    ],
                    limit: 500,
                    tableCalculations: [],
                },
            },
        },
    );
    expect(startResp.status).toBe(200);
    const { queryUuid } = startResp.body.results;

    // Poll for results
    let attempts = 0;
    while (attempts < 30) {
        const pollResp = await client.request<
            Body<{ status: string; rows: Array<Record<string, unknown>> }>
        >(
            `${apiUrl}/projects/${projectUuid}/query/${queryUuid}?page=1&pageSize=500`,
        );
        expect(pollResp.status).toBe(200);

        if (pollResp.body.results.status === 'ready') {
            return pollResp.body.results.rows as Array<
                Record<string, { value: { raw: string; formatted: string } }>
            >;
        }
        if (pollResp.body.results.status === 'error') {
            const errorDetails = JSON.stringify(pollResp.body.results, null, 2);
            throw new Error(`Query failed: ${errorDetails}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
        attempts++;
    }
    throw new Error('Query timed out');
}

function getRowCount(
    rows: Array<Record<string, { value: { raw: string; formatted: string } }>>,
    dayFormatted: string,
): number {
    const row = rows.find(
        (r) =>
            r.timezone_test_event_timestamp_day?.value?.formatted ===
            dayFormatted,
    );
    return row ? parseInt(row.timezone_test_count?.value?.raw ?? '0', 10) : 0;
}

function getTotalCount(
    rows: Array<Record<string, { value: { raw: string; formatted: string } }>>,
): number {
    return rows.reduce(
        (sum, r) =>
            sum + parseInt(r.timezone_test_count?.value?.raw ?? '0', 10),
        0,
    );
}

describe('Data timezone', () => {
    beforeAll(async () => {
        admin = await login();
    });

    describe('without dataTimezone (UTC default)', () => {
        beforeAll(async () => {
            await updateDataTimezone(admin, undefined);
        });

        it('should group events by UTC day boundaries', async () => {
            const rows = await runAsyncQuery(admin, {
                dimensions: ['timezone_test_event_timestamp_day'],
                metrics: ['timezone_test_count'],
            });

            expect(rows).toHaveLength(2);
            expect(getRowCount(rows, '2024-01-15')).toBe(6);
            expect(getRowCount(rows, '2024-01-16')).toBe(4);
        });

        it('should filter by UTC day for equals filter', async () => {
            const rows = await runAsyncQuery(admin, {
                dimensions: ['timezone_test_event_timestamp_day'],
                metrics: ['timezone_test_count'],
                filters: {
                    dimensions: {
                        id: 'tz-test',
                        and: [
                            {
                                id: 'tz-equals',
                                target: {
                                    fieldId:
                                        'timezone_test_event_timestamp_day',
                                },
                                operator: 'equals',
                                values: ['2024-01-15'],
                            },
                        ],
                    },
                },
            });

            expect(getTotalCount(rows)).toBe(6);
        });

        it('should filter by UTC day for greaterThan filter', async () => {
            const rows = await runAsyncQuery(admin, {
                dimensions: ['timezone_test_event_timestamp_day'],
                metrics: ['timezone_test_count'],
                filters: {
                    dimensions: {
                        id: 'tz-test',
                        and: [
                            {
                                id: 'tz-gt',
                                target: {
                                    fieldId:
                                        'timezone_test_event_timestamp_day',
                                },
                                operator: 'greaterThan',
                                values: ['2024-01-15'],
                            },
                        ],
                    },
                },
            });

            // Only Jan 16 events (4)
            expect(getTotalCount(rows)).toBe(4);
        });
    });

    describe('with dataTimezone = Pacific/Pago_Pago (UTC-11)', () => {
        beforeAll(async () => {
            await updateDataTimezone(admin, 'Pacific/Pago_Pago');
        });

        it('should group events by Pago Pago day boundaries', async () => {
            const rows = await runAsyncQuery(admin, {
                dimensions: ['timezone_test_event_timestamp_day'],
                metrics: ['timezone_test_count'],
            });

            expect(rows).toHaveLength(3);
            expect(getRowCount(rows, '2024-01-14')).toBe(4);
            expect(getRowCount(rows, '2024-01-15')).toBe(4);
            expect(getRowCount(rows, '2024-01-16')).toBe(2);
        });

        it('should filter by Pago Pago day for equals filter', async () => {
            const rows = await runAsyncQuery(admin, {
                dimensions: ['timezone_test_event_timestamp_day'],
                metrics: ['timezone_test_count'],
                filters: {
                    dimensions: {
                        id: 'tz-test',
                        and: [
                            {
                                id: 'tz-equals',
                                target: {
                                    fieldId:
                                        'timezone_test_event_timestamp_day',
                                },
                                operator: 'equals',
                                values: ['2024-01-15'],
                            },
                        ],
                    },
                },
            });

            expect(getTotalCount(rows)).toBe(4);
        });

        it('should filter by Pago Pago day for greaterThan filter', async () => {
            const rows = await runAsyncQuery(admin, {
                dimensions: ['timezone_test_event_timestamp_day'],
                metrics: ['timezone_test_count'],
                filters: {
                    dimensions: {
                        id: 'tz-test',
                        and: [
                            {
                                id: 'tz-gt',
                                target: {
                                    fieldId:
                                        'timezone_test_event_timestamp_day',
                                },
                                operator: 'greaterThan',
                                values: ['2024-01-15'],
                            },
                        ],
                    },
                },
            });

            // Only Jan 16 events in Pago Pago (2)
            expect(getTotalCount(rows)).toBe(2);
        });
    });

    afterAll(async () => {
        await updateDataTimezone(admin, undefined);
    });
});
