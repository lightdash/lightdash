import {
    ApiExecuteAsyncMetricQueryResults,
    ApiGetAsyncQueryResults,
    assertUnreachable,
    DimensionType,
    FilterOperator,
    QueryHistoryStatus,
    SEED_PROJECT,
    TableCalculationType,
    type MetricQuery,
    type ReadyQueryResultsPage,
} from '@lightdash/common';
import { beforeAll, describe, expect, it } from 'vitest';
import { ApiClient, Body } from '../helpers/api-client';
import { login } from '../helpers/auth';

const apiUrl = '/api/v2';
const calculationName = 'ranking';
const fieldReference = (fieldId: string) => `\${${fieldId}}`;

const baseQuery = {
    exploreName: 'orders',
    dimensions: ['orders_order_date_month'],
    metrics: ['orders_total_order_amount'],
    sorts: [{ fieldId: 'orders_order_date_month', descending: false }],
    limit: 500,
    additionalMetrics: [],
    metricOverrides: {},
} satisfies Omit<MetricQuery, 'filters' | 'tableCalculations'>;

async function runMetricQuery(
    client: ApiClient,
    query: MetricQuery,
): Promise<ReadyQueryResultsPage> {
    const executeResponse = await client.post<
        Body<ApiExecuteAsyncMetricQueryResults>
    >(`${apiUrl}/projects/${SEED_PROJECT.project_uuid}/query/metric-query`, {
        context: 'exploreView',
        query,
    });
    expect(executeResponse.status).toBe(200);

    const { queryUuid } = executeResponse.body.results;
    const deadline = Date.now() + 60_000;

    while (Date.now() < deadline) {
        const response = await client.get<Body<ApiGetAsyncQueryResults>>(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/query/${queryUuid}?page=1&pageSize=500`,
        );
        expect(response.status).toBe(200);

        const { results } = response.body;
        const { status } = results;
        switch (status) {
            case QueryHistoryStatus.READY:
                return results;
            case QueryHistoryStatus.PENDING:
            case QueryHistoryStatus.QUEUED:
            case QueryHistoryStatus.EXECUTING:
                break;
            case QueryHistoryStatus.ERROR:
            case QueryHistoryStatus.EXPIRED:
                throw new Error(
                    results.error ?? `Query finished with status ${status}`,
                );
            case QueryHistoryStatus.CANCELLED:
                throw new Error(`Query finished with status ${status}`);
            default:
                return assertUnreachable(
                    status,
                    `Unknown query history status: ${status}`,
                );
        }

        await new Promise((resolve) => setTimeout(resolve, 200));
    }

    throw new Error('Table calculation query did not complete in time');
}

const getCalculationValues = (results: ReadyQueryResultsPage) =>
    results.rows.map((row) => row[calculationName]?.value.raw);

const isNumericValueGreaterThan = (value: unknown, threshold: number) => {
    const numericValue =
        typeof value === 'number' || typeof value === 'string'
            ? Number(value)
            : Number.NaN;
    return Number.isFinite(numericValue) && numericValue > threshold;
};

describe('Table calculation query API', () => {
    let admin: ApiClient;

    beforeAll(async () => {
        admin = await login();
    });

    it('filters a typed string calculation with startsWith', async () => {
        const query = {
            ...baseQuery,
            filters: {
                tableCalculations: {
                    id: 'table-calculation-filters',
                    and: [
                        {
                            id: 'ranking-starts-with-filter',
                            target: { fieldId: calculationName },
                            operator: FilterOperator.STARTS_WITH,
                            values: ['rank_1'],
                        },
                    ],
                },
            },
            tableCalculations: [
                {
                    name: calculationName,
                    displayName: 'Ranking',
                    type: TableCalculationType.STRING,
                    sql: `'rank_' || RANK() OVER(ORDER BY ${fieldReference(
                        'orders.total_order_amount',
                    )} ASC)`,
                },
            ],
        } satisfies MetricQuery;

        const results = await runMetricQuery(admin, query);
        expect(results.columns[calculationName]).toEqual({
            reference: calculationName,
            type: DimensionType.STRING,
        });

        const values = getCalculationValues(results);
        expect(values.length).toBeGreaterThan(0);
        expect(
            values.every(
                (value) =>
                    typeof value === 'string' && value.startsWith('rank_1'),
            ),
        ).toBe(true);
    });

    it('filters a typed number calculation with greaterThan', async () => {
        const query = {
            ...baseQuery,
            filters: {
                tableCalculations: {
                    id: 'table-calculation-filters',
                    and: [
                        {
                            id: 'ranking-greater-than-filter',
                            target: { fieldId: calculationName },
                            operator: FilterOperator.GREATER_THAN,
                            values: [2000],
                        },
                    ],
                },
            },
            tableCalculations: [
                {
                    name: calculationName,
                    displayName: 'Ranking',
                    type: TableCalculationType.NUMBER,
                    sql: `RANK() OVER(ORDER BY ${fieldReference(
                        'orders.total_order_amount',
                    )} ASC) * 100`,
                },
            ],
        } satisfies MetricQuery;

        const results = await runMetricQuery(admin, query);
        expect(results.columns[calculationName]).toEqual({
            reference: calculationName,
            type: DimensionType.NUMBER,
        });

        const values = getCalculationValues(results);
        expect(values.length).toBeGreaterThan(0);
        expect(
            values.every((value) => isNumericValueGreaterThan(value, 2000)),
        ).toBe(true);
    });
});
