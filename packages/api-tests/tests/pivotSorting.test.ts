import {
    CartesianSeriesType,
    ChartType,
    FilterOperator,
    QueryHistoryStatus,
    SEED_PROJECT,
    TableCalculationType,
    type ApiGetAsyncQueryResults,
    type CreateChartInSpace,
    type ResultRow,
    type SavedChart,
} from '@lightdash/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiClient, Body } from '../helpers/api-client';
import { login } from '../helpers/auth';
import { uniqueName } from '../helpers/test-isolation';

const apiV1Url = '/api/v1';
const apiV2Url = '/api/v2';
const projectUuid = SEED_PROJECT.project_uuid;

type ReadyQueryResults = Extract<
    ApiGetAsyncQueryResults,
    { status: QueryHistoryStatus.READY }
>;

const getRawValues = (rows: ResultRow[], fieldId: string): unknown[] =>
    rows
        .map((row) => row[fieldId]?.value.raw)
        .filter((value) => value !== undefined && value !== null);

const getColumnIds = (results: ReadyQueryResults): string[] => [
    ...Object.keys(results.columns),
    ...results.rows.flatMap((row) => Object.keys(row)),
];

const booleanEqualsFilter = (fieldId: string, value: boolean) => ({
    dimensions: {
        id: `${fieldId}-filter`,
        and: [
            {
                id: `${fieldId}-equals-${String(value)}`,
                target: { fieldId },
                operator: FilterOperator.EQUALS,
                values: [value],
            },
        ],
    },
});

const fieldReference = (fieldId: string) => `\${${fieldId}}`;

const customerLabelTableCalculation = {
    name: 'customer_label',
    displayName: 'Customer label',
    type: TableCalculationType.STRING,
    sql: `concat(${fieldReference('customers.first_name')}, ' ', ${fieldReference(
        'customers.last_name',
    )})`,
};

const xAxisTableCalculationChart = (): CreateChartInSpace => ({
    name: uniqueName('Pivot sort x-axis table calculation'),
    tableName: 'orders',
    metricQuery: {
        exploreName: 'orders',
        dimensions: [
            'customers_first_name',
            'customers_last_name',
            'orders_order_date_week',
        ],
        metrics: ['orders_total_order_amount'],
        filters: {},
        sorts: [{ fieldId: 'customer_label', descending: false }],
        limit: 500,
        tableCalculations: [customerLabelTableCalculation],
        additionalMetrics: [],
        metricOverrides: {},
    },
    pivotConfig: { columns: ['orders_order_date_week'] },
    chartConfig: {
        type: ChartType.CARTESIAN,
        config: {
            layout: {
                xField: 'customer_label',
                yField: ['orders_total_order_amount'],
            },
            eChartsConfig: {
                series: [
                    {
                        type: CartesianSeriesType.BAR,
                        yAxisIndex: 0,
                        encode: {
                            xRef: { field: 'customer_label' },
                            yRef: { field: 'orders_total_order_amount' },
                        },
                    },
                ],
            },
        },
    },
    tableConfig: {
        columnOrder: [
            'customers_first_name',
            'customers_last_name',
            'orders_order_date_week',
            'orders_total_order_amount',
            'customer_label',
        ],
    },
});

const xAxisMetricChart = (): CreateChartInSpace => ({
    name: uniqueName('Pivot sort x-axis metric'),
    tableName: 'orders',
    metricQuery: {
        exploreName: 'orders',
        dimensions: ['orders_is_completed'],
        metrics: ['orders_unique_order_count', 'orders_total_order_amount'],
        filters: {},
        sorts: [{ fieldId: 'orders_unique_order_count', descending: true }],
        limit: 500,
        tableCalculations: [],
        additionalMetrics: [],
        metricOverrides: {},
    },
    pivotConfig: { columns: ['orders_is_completed'] },
    chartConfig: {
        type: ChartType.CARTESIAN,
        config: {
            layout: {
                xField: 'orders_unique_order_count',
                yField: ['orders_total_order_amount'],
            },
            eChartsConfig: {
                series: [
                    {
                        type: CartesianSeriesType.SCATTER,
                        yAxisIndex: 0,
                        encode: {
                            xRef: { field: 'orders_unique_order_count' },
                            yRef: { field: 'orders_total_order_amount' },
                        },
                    },
                ],
            },
        },
    },
    tableConfig: {
        columnOrder: [
            'orders_is_completed',
            'orders_unique_order_count',
            'orders_total_order_amount',
        ],
    },
});

const sortOnlyTableCalculationChart = (): CreateChartInSpace => ({
    name: uniqueName('Pivot sort-only table calculation'),
    tableName: 'orders',
    metricQuery: {
        exploreName: 'orders',
        dimensions: ['customers_customer_id', 'orders_is_completed'],
        metrics: ['orders_total_order_amount'],
        filters: booleanEqualsFilter('orders_is_completed', true),
        sorts: [{ fieldId: 'revenue_rank', descending: false }],
        limit: 500,
        tableCalculations: [
            {
                name: 'revenue_rank',
                displayName: 'Revenue rank',
                type: TableCalculationType.NUMBER,
                sql: `rank() over (order by ${fieldReference(
                    'orders.total_order_amount',
                )} desc)`,
            },
        ],
        additionalMetrics: [],
        metricOverrides: {},
    },
    pivotConfig: { columns: ['orders_is_completed'] },
    chartConfig: {
        type: ChartType.CARTESIAN,
        config: {
            layout: {
                xField: 'customers_customer_id',
                yField: ['orders_total_order_amount'],
            },
            eChartsConfig: {
                series: [
                    {
                        type: CartesianSeriesType.BAR,
                        yAxisIndex: 0,
                        encode: {
                            xRef: { field: 'customers_customer_id' },
                            yRef: { field: 'orders_total_order_amount' },
                        },
                    },
                ],
            },
        },
    },
    tableConfig: {
        columnOrder: [
            'customers_customer_id',
            'orders_is_completed',
            'orders_total_order_amount',
            'revenue_rank',
        ],
    },
});

const hiddenMetricSortChart = (): CreateChartInSpace => ({
    name: uniqueName('Pivot sort hidden metric'),
    tableName: 'orders',
    metricQuery: {
        exploreName: 'orders',
        dimensions: ['customers_customer_id', 'orders_is_completed'],
        metrics: ['orders_total_order_amount', 'orders_unique_order_count'],
        filters: booleanEqualsFilter('orders_is_completed', true),
        sorts: [
            { fieldId: 'orders_total_order_amount', descending: true },
            { fieldId: 'customers_customer_id', descending: false },
        ],
        limit: 500,
        tableCalculations: [],
        additionalMetrics: [],
        metricOverrides: {},
    },
    pivotConfig: { columns: ['orders_is_completed'] },
    chartConfig: {
        type: ChartType.CARTESIAN,
        config: {
            layout: {
                xField: 'customers_customer_id',
                yField: ['orders_unique_order_count'],
            },
            eChartsConfig: {
                series: [
                    {
                        type: CartesianSeriesType.BAR,
                        yAxisIndex: 0,
                        encode: {
                            xRef: { field: 'customers_customer_id' },
                            yRef: { field: 'orders_unique_order_count' },
                        },
                    },
                ],
            },
        },
    },
    tableConfig: {
        columnOrder: [
            'customers_customer_id',
            'orders_is_completed',
            'orders_total_order_amount',
            'orders_unique_order_count',
        ],
    },
});

async function createChart(
    client: ApiClient,
    chart: CreateChartInSpace,
): Promise<SavedChart> {
    const response = await client.post<Body<SavedChart>>(
        `${apiV1Url}/projects/${projectUuid}/saved`,
        chart,
    );
    expect(response.status).toBe(200);
    return response.body.results;
}

async function executeSavedChart(
    client: ApiClient,
    chartUuid: string,
): Promise<string> {
    const response = await client.post<Body<{ queryUuid: string }>>(
        `${apiV2Url}/projects/${projectUuid}/query/chart`,
        {
            chartUuid,
            invalidateCache: true,
            pivotResults: true,
        },
    );
    expect(response.status).toBe(200);
    return response.body.results.queryUuid;
}

async function executeMetricQuery(
    client: ApiClient,
    chart: CreateChartInSpace,
): Promise<string> {
    const response = await client.post<Body<{ queryUuid: string }>>(
        `${apiV2Url}/projects/${projectUuid}/query/metric-query`,
        {
            invalidateCache: true,
            query: chart.metricQuery,
        },
    );
    expect(response.status).toBe(200);
    return response.body.results.queryUuid;
}

async function pollQueryResults(
    client: ApiClient,
    queryUuid: string,
): Promise<ReadyQueryResults> {
    for (let attempt = 0; attempt < 30; attempt += 1) {
        const response = await client.get<Body<ApiGetAsyncQueryResults>>(
            `${apiV2Url}/projects/${projectUuid}/query/${queryUuid}?page=1&pageSize=500`,
        );
        expect(response.status).toBe(200);

        if (response.body.results.status === QueryHistoryStatus.READY) {
            return response.body.results;
        }

        if (response.body.results.status === QueryHistoryStatus.ERROR) {
            throw new Error(
                `Query failed: ${JSON.stringify(response.body.results)}`,
            );
        }

        await new Promise<void>((resolve) => {
            setTimeout(resolve, 500);
        });
    }

    throw new Error(`Query ${queryUuid} did not finish`);
}

async function runSavedChart(
    client: ApiClient,
    chart: CreateChartInSpace,
): Promise<{ savedChart: SavedChart; results: ReadyQueryResults }> {
    const savedChart = await createChart(client, chart);
    const queryUuid = await executeSavedChart(client, savedChart.uuid);
    const results = await pollQueryResults(client, queryUuid);
    return { savedChart, results };
}

describe('Pivot sorting', () => {
    let admin: Awaited<ReturnType<typeof login>>;
    const chartUuids: string[] = [];

    beforeAll(async () => {
        admin = await login();
    });

    afterAll(async () => {
        for (const chartUuid of chartUuids) {
            await admin
                .delete(`${apiV1Url}/saved/${chartUuid}`, {
                    failOnStatusCode: false,
                })
                .catch(() => undefined);
        }
    });

    it('returns x-axis table calculation values when the chart is sorted by that table calculation', async () => {
        const { savedChart, results } = await runSavedChart(
            admin,
            xAxisTableCalculationChart(),
        );
        chartUuids.push(savedChart.uuid);

        const customerLabels = getRawValues(results.rows, 'customer_label');

        expect(customerLabels.length).toBeGreaterThan(1);
        expect(new Set(customerLabels).size).toBeGreaterThan(1);
        expect(customerLabels).toEqual([...customerLabels].sort());
    });

    it('returns x-axis metric values when the chart is sorted by that metric', async () => {
        const { savedChart, results } = await runSavedChart(
            admin,
            xAxisMetricChart(),
        );
        chartUuids.push(savedChart.uuid);

        const orderCounts = getRawValues(
            results.rows,
            'orders_unique_order_count',
        );

        expect(orderCounts.length).toBeGreaterThan(0);
    });

    it('does not expose a table calculation that is only used for sorting', async () => {
        const { savedChart, results } = await runSavedChart(
            admin,
            sortOnlyTableCalculationChart(),
        );
        chartUuids.push(savedChart.uuid);

        expect(getColumnIds(results)).not.toContain('revenue_rank');
        expect(
            getColumnIds(results).some((columnId) =>
                columnId.includes('revenue_rank'),
            ),
        ).toBe(false);
    });

    it('sorts pivoted rows by a metric that is not displayed in the chart', async () => {
        const chart = hiddenMetricSortChart();
        const baselineQueryUuid = await executeMetricQuery(admin, chart);
        const baselineResults = await pollQueryResults(
            admin,
            baselineQueryUuid,
        );
        const expectedCustomerIds = getRawValues(
            baselineResults.rows,
            'customers_customer_id',
        );

        const { savedChart, results } = await runSavedChart(admin, chart);
        chartUuids.push(savedChart.uuid);

        const actualCustomerIds = getRawValues(
            results.rows,
            'customers_customer_id',
        );

        expect(actualCustomerIds.length).toBeGreaterThan(1);
        expect(actualCustomerIds).toEqual(
            expectedCustomerIds.slice(0, actualCustomerIds.length),
        );
        expect(
            getColumnIds(results).some((columnId) =>
                columnId.includes('orders_total_order_amount'),
            ),
        ).toBe(false);
    });
});
