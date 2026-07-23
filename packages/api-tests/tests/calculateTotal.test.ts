import {
    FilterOperator,
    QueryHistoryStatus,
    SEED_PROJECT,
    VizAggregationOptions,
    VizIndexType,
    type ApiGetAsyncQueryResults,
    type CalculateTotalKind,
    type MetricQuery,
    type PivotConfiguration,
    type ResultRow,
} from '@lightdash/common';
import { beforeAll, describe, expect, it } from 'vitest';
import { ApiClient, Body } from '../helpers/api-client';
import { login } from '../helpers/auth';

const apiUrl = '/api/v2';
const sourceLimit = 500;
const monthDimension = 'orders_order_date_month';
const statusDimension = 'orders_status';
const sourceDimension = 'orders_order_source';
const metrics = ['orders_unique_order_count', 'orders_average_order_size'];

const valuesColumns = metrics.map((reference) => ({
    reference,
    aggregation: VizAggregationOptions.ANY,
}));

const indexColumn = [
    {
        reference: monthDimension,
        type: VizIndexType.TIME,
    },
    {
        reference: statusDimension,
        type: VizIndexType.CATEGORY,
    },
];

const sourceQuery: MetricQuery = {
    exploreName: 'orders',
    dimensions: [monthDimension, statusDimension, sourceDimension],
    metrics,
    filters: {
        dimensions: {
            id: 'total-date-filter',
            and: [
                {
                    id: 'total-date-range',
                    target: { fieldId: monthDimension },
                    operator: FilterOperator.IN_BETWEEN,
                    values: ['2025-01-01', '2025-02-01'],
                },
            ],
        },
    },
    sorts: [
        { fieldId: monthDimension, descending: false },
        { fieldId: statusDimension, descending: false },
    ],
    limit: sourceLimit,
    tableCalculations: [],
    additionalMetrics: [],
    metricOverrides: {},
};

const sourcePivotConfiguration: PivotConfiguration = {
    indexColumn,
    groupByColumns: [{ reference: sourceDimension }],
    valuesColumns,
    sortBy: undefined,
};

type ReadyResults = Extract<
    ApiGetAsyncQueryResults,
    { status: QueryHistoryStatus.READY }
>;

const delay = (milliseconds: number) =>
    new Promise<void>((resolve) => {
        setTimeout(resolve, milliseconds);
    });

async function pollQueryResults(
    client: ApiClient,
    projectUuid: string,
    queryUuid: string,
): Promise<ReadyResults> {
    const pageSize = 500;

    for (let attempt = 0; attempt < 300; attempt += 1) {
        const response = await client.get<Body<ApiGetAsyncQueryResults>>(
            `${apiUrl}/projects/${projectUuid}/query/${queryUuid}?page=1&pageSize=${pageSize}`,
        );
        const { results } = response.body;

        if (
            results.status === QueryHistoryStatus.ERROR ||
            results.status === QueryHistoryStatus.EXPIRED
        ) {
            throw new Error(
                `Query ${queryUuid} failed with status ${results.status}: ${results.error}`,
            );
        }

        if (results.status === QueryHistoryStatus.CANCELLED) {
            throw new Error(`Query ${queryUuid} was cancelled`);
        }

        if (results.status === QueryHistoryStatus.READY) {
            const rows = [...results.rows];
            const totalPageCount = results.totalPageCount ?? 1;

            for (let page = 2; page <= totalPageCount; page += 1) {
                const pageResponse = await client.get<
                    Body<ApiGetAsyncQueryResults>
                >(
                    `${apiUrl}/projects/${projectUuid}/query/${queryUuid}?page=${page}&pageSize=${pageSize}`,
                );
                const pageResults = pageResponse.body.results;
                if (pageResults.status !== QueryHistoryStatus.READY) {
                    throw new Error(
                        `Query ${queryUuid} returned ${pageResults.status} while fetching page ${page}`,
                    );
                }
                rows.push(...pageResults.rows);
            }

            return { ...results, rows };
        }

        await delay(200);
    }

    throw new Error(`Query ${queryUuid} did not complete in time`);
}

async function runMetricQuery(
    client: ApiClient,
    query: MetricQuery,
    pivotConfiguration?: PivotConfiguration,
): Promise<{ queryUuid: string; results: ReadyResults }> {
    const projectUuid = SEED_PROJECT.project_uuid;
    const response = await client.post<Body<{ queryUuid: string }>>(
        `${apiUrl}/projects/${projectUuid}/query/metric-query`,
        {
            context: 'exploreView',
            query,
            pivotConfiguration,
        },
    );

    expect(response.status).toBe(200);
    const { queryUuid } = response.body.results;
    const results = await pollQueryResults(client, projectUuid, queryUuid);
    return { queryUuid, results };
}

async function runTotalQuery(
    client: ApiClient,
    sourceQueryUuid: string,
    kind: CalculateTotalKind,
    subtotalDimensions?: string[],
): Promise<ReadyResults> {
    const projectUuid = SEED_PROJECT.project_uuid;
    const response = await client.post<Body<{ queryUuid: string }>>(
        `${apiUrl}/projects/${projectUuid}/query/${sourceQueryUuid}/calculate-total`,
        { kind, subtotalDimensions },
    );

    expect(response.status).toBe(200);
    return pollQueryResults(
        client,
        projectUuid,
        response.body.results.queryUuid,
    );
}

type RawRow = Record<string, unknown>;

const sortRawRows = (rows: RawRow[]) =>
    rows
        .map((row) =>
            Object.fromEntries(
                Object.entries(row)
                    .sort(([left], [right]) => left.localeCompare(right))
                    .map(([fieldId, value]) => [fieldId, value]),
            ),
        )
        .sort((left, right) =>
            JSON.stringify(left).localeCompare(JSON.stringify(right)),
        );

const normalizeRows = (rows: ResultRow[]) =>
    sortRawRows(
        rows.map((row) =>
            Object.fromEntries(
                Object.entries(row).map(([fieldId, cell]) => [
                    fieldId,
                    cell.value.raw,
                ]),
            ),
        ),
    );

type TotalCase = {
    label: string;
    kind: CalculateTotalKind;
    subtotalDimensions?: string[];
    expectedRows: RawRow[];
};

const totalCases: TotalCase[] = [
    {
        label: 'grand total',
        kind: 'grandTotal',
        expectedRows: [
            {
                orders_average_order_size: 28.74603448275862,
                orders_unique_order_count: '58',
            },
        ],
    },
    {
        label: 'column total',
        kind: 'columnTotal',
        expectedRows: [
            {
                orders_average_order_size_any_mobile_app: 28.779444444444444,
                orders_average_order_size_any_phone: 26.44545454545454,
                orders_average_order_size_any_website: 29.59793103448276,
                orders_unique_order_count_any_mobile_app: '18',
                orders_unique_order_count_any_phone: '11',
                orders_unique_order_count_any_website: '29',
            },
        ],
    },
    {
        label: 'row total',
        kind: 'rowTotal',
        expectedRows: [
            {
                orders_average_order_size_any: 22.47826086956522,
                orders_order_date_month: '2025-01-01T00:00:00Z',
                orders_status: 'completed',
                orders_unique_order_count_any: '23',
            },
            {
                orders_average_order_size_any: 36.777,
                orders_order_date_month: '2025-01-01T00:00:00Z',
                orders_status: 'placed',
                orders_unique_order_count_any: '10',
            },
            {
                orders_average_order_size_any: 20.916666666666668,
                orders_order_date_month: '2025-01-01T00:00:00Z',
                orders_status: 'shipped',
                orders_unique_order_count_any: '12',
            },
            {
                orders_average_order_size_any: 56.4,
                orders_order_date_month: '2025-02-01T00:00:00Z',
                orders_status: 'completed',
                orders_unique_order_count_any: '5',
            },
            {
                orders_average_order_size_any: 35.875,
                orders_order_date_month: '2025-02-01T00:00:00Z',
                orders_status: 'placed',
                orders_unique_order_count_any: '4',
            },
            {
                orders_average_order_size_any: 26.5,
                orders_order_date_month: '2025-02-01T00:00:00Z',
                orders_status: 'shipped',
                orders_unique_order_count_any: '4',
            },
        ],
    },
    {
        label: 'column subtotal',
        kind: 'columnSubtotal',
        subtotalDimensions: [monthDimension],
        expectedRows: [
            {
                orders_average_order_size: 24.802,
                orders_order_date_month: '2025-01-01T00:00:00Z',
                orders_order_source: 'mobile_app',
                orders_unique_order_count: '15',
            },
            {
                orders_average_order_size: 21.8625,
                orders_order_date_month: '2025-01-01T00:00:00Z',
                orders_order_source: 'phone',
                orders_unique_order_count: '8',
            },
            {
                orders_average_order_size: 26.765454545454546,
                orders_order_date_month: '2025-01-01T00:00:00Z',
                orders_order_source: 'website',
                orders_unique_order_count: '22',
            },
            {
                orders_average_order_size: 48.666666666666664,
                orders_order_date_month: '2025-02-01T00:00:00Z',
                orders_order_source: 'mobile_app',
                orders_unique_order_count: '3',
            },
            {
                orders_average_order_size: 38.666666666666664,
                orders_order_date_month: '2025-02-01T00:00:00Z',
                orders_order_source: 'phone',
                orders_unique_order_count: '3',
            },
            {
                orders_average_order_size: 38.5,
                orders_order_date_month: '2025-02-01T00:00:00Z',
                orders_order_source: 'website',
                orders_unique_order_count: '7',
            },
        ],
    },
    {
        label: 'row subtotal',
        kind: 'rowSubtotal',
        subtotalDimensions: [monthDimension],
        expectedRows: [
            {
                orders_average_order_size: 25.239333333333335,
                orders_order_date_month: '2025-01-01T00:00:00Z',
                orders_unique_order_count: '45',
            },
            {
                orders_average_order_size: 40.88461538461539,
                orders_order_date_month: '2025-02-01T00:00:00Z',
                orders_unique_order_count: '13',
            },
        ],
    },
];

describe('Calculate total API', () => {
    let admin: ApiClient;
    let sourceQueryUuid: string;

    beforeAll(async () => {
        admin = await login();
        const source = await runMetricQuery(
            admin,
            sourceQuery,
            sourcePivotConfiguration,
        );

        sourceQueryUuid = source.queryUuid;
        expect(source.results.rows.length).toBeGreaterThan(0);
        expect(source.results.totalResults).toBeGreaterThan(0);
        expect(source.results.totalResults).toBeLessThan(sourceLimit);
    }, 120_000);

    it.each(totalCases)(
        'calculates the $label at the expected grain',
        async ({ kind, subtotalDimensions, expectedRows }) => {
            const actual = await runTotalQuery(
                admin,
                sourceQueryUuid,
                kind,
                subtotalDimensions,
            );

            expect(normalizeRows(actual.rows)).toEqual(
                sortRawRows(expectedRows),
            );
        },
    );
});
