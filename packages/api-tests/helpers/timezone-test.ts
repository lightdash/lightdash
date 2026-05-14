import { SEED_PROJECT } from '@lightdash/common';
import { expect } from 'vitest';
import { ApiClient, Body } from './api-client';

const apiUrl = '/api/v2';
const projectUuid = SEED_PROJECT.project_uuid;

export async function getProjectConfig(client: ApiClient): Promise<{
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

export async function updateDataTimezone(
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

export async function updateUserTimezone(
    client: ApiClient,
    timezone: string | null,
): Promise<void> {
    const resp = await client.request(`/api/v1/user/me`, {
        method: 'PATCH',
        body: { timezone },
    });
    expect(resp.status).toBe(200);
}

// Scope queries to "interior rows" (ids 1-10) — boundary rows 11-18 are
// reserved for DST / year / month boundary tests. See the row breakdown in
// examples/full-jaffle-shop-demo/dbt/models/timezone_test.yml.
const INTERIOR_ROWS_FILTER = {
    id: 'tz-interior-rows',
    target: { fieldId: 'timezone_test_event_id' },
    operator: 'lessThan',
    values: [11],
};

function withInteriorRowsScope(
    filters: Record<string, unknown> | undefined,
): Record<string, unknown> {
    const existing =
        (filters?.dimensions as { id?: string; and?: unknown[] } | undefined) ??
        undefined;
    const extraAnd = existing?.and ?? (existing ? [existing] : []);
    return {
        ...filters,
        dimensions: {
            id: 'tz-scope',
            and: [INTERIOR_ROWS_FILTER, ...extraAnd],
        },
    };
}

export async function runTimezoneTestQuery(
    client: ApiClient,
    options: {
        dimensions: string[];
        metrics: string[];
        filters?: Record<string, unknown>;
        sorts?: Array<{ fieldId: string; descending: boolean }>;
        timezone?: string;
    },
): Promise<
    Array<Record<string, { value: { raw: string; formatted: string } }>>
> {
    const startResp = await client.request<Body<{ queryUuid: string }>>(
        `${apiUrl}/projects/${projectUuid}/query/metric-query`,
        {
            method: 'POST',
            body: {
                query: {
                    exploreName: 'timezone_test',
                    dimensions: options.dimensions,
                    metrics: options.metrics,
                    filters: withInteriorRowsScope(options.filters),
                    sorts: options.sorts ?? [
                        {
                            fieldId: options.dimensions[0],
                            descending: false,
                        },
                    ],
                    limit: 500,
                    tableCalculations: [],
                    timezone: options.timezone,
                },
            },
        },
    );
    expect(startResp.status).toBe(200);
    const { queryUuid } = startResp.body.results;

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

type TimezoneTestRow = Record<
    string,
    { value: { raw: string; formatted: string } }
>;

export function getRowCount(
    rows: TimezoneTestRow[],
    dayFormatted: string,
    dimensionKey: string,
    metricKey: string,
): number {
    const row = rows.find(
        (r) => r[dimensionKey]?.value?.formatted === dayFormatted,
    );
    return row ? parseInt(row[metricKey]?.value?.raw ?? '0', 10) : 0;
}

export function getTotalCount(
    rows: TimezoneTestRow[],
    metricKey: string,
): number {
    return rows.reduce(
        (sum, r) => sum + parseInt(r[metricKey]?.value?.raw ?? '0', 10),
        0,
    );
}
