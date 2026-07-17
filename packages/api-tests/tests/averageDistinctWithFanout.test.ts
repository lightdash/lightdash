import {
    assertUnreachable,
    QueryHistoryStatus,
    SEED_PROJECT,
} from '@lightdash/common';
import { beforeAll, describe, expect, it } from 'vitest';
import { ApiClient, Body } from '../helpers/api-client';
import { login } from '../helpers/auth';
import { pollUntil } from '../helpers/polling';

const apiUrl = '/api/v2';

type ResultCell = {
    value: {
        raw: unknown;
        formatted: string;
    };
};

type ResultRow = Record<string, ResultCell>;

type AsyncQueryResults =
    | {
          status: QueryHistoryStatus.READY;
          rows: ResultRow[];
      }
    | {
          status:
              | QueryHistoryStatus.PENDING
              | QueryHistoryStatus.QUEUED
              | QueryHistoryStatus.EXECUTING;
      }
    | {
          status: QueryHistoryStatus.CANCELLED;
      }
    | {
          status: QueryHistoryStatus.ERROR | QueryHistoryStatus.EXPIRED;
          error: string | null;
      };

type AsyncQueryResultsBody = Body<AsyncQueryResults>;

const runMetricQuery = async (
    client: ApiClient,
    projectUuid: string,
    query: Record<string, unknown>,
): Promise<ResultRow[]> => {
    const executeResponse = await client.post<Body<{ queryUuid: string }>>(
        `${apiUrl}/projects/${projectUuid}/query/metric-query`,
        {
            context: 'exploreView',
            query,
        },
    );
    expect(executeResponse.status).toBe(200);

    const { queryUuid } = executeResponse.body.results;
    if (!queryUuid) {
        throw new Error('Metric query response did not include a query UUID');
    }

    const resultsBody = await pollUntil<AsyncQueryResultsBody>(
        client,
        `${apiUrl}/projects/${projectUuid}/query/${queryUuid}`,
        {
            timeout: 60_000,
            interval: 200,
            condition: (body) => {
                const { results } = body;
                const { status } = results;

                switch (status) {
                    case QueryHistoryStatus.READY:
                        return true;
                    case QueryHistoryStatus.PENDING:
                    case QueryHistoryStatus.QUEUED:
                    case QueryHistoryStatus.EXECUTING:
                        return false;
                    case QueryHistoryStatus.CANCELLED:
                        throw new Error(`Query ${queryUuid} was cancelled`);
                    case QueryHistoryStatus.ERROR:
                    case QueryHistoryStatus.EXPIRED:
                        throw new Error(
                            `Query ${queryUuid} ${status}: ${results.error ?? 'unknown error'}`,
                        );
                    default:
                        return assertUnreachable(
                            status,
                            'Unknown query history status',
                        );
                }
            },
        },
    );

    if (resultsBody.results.status !== QueryHistoryStatus.READY) {
        throw new Error(`Query ${queryUuid} completed without ready results`);
    }

    return resultsBody.results.rows;
};

const getRawValue = (row: ResultRow, fieldId: string): unknown => {
    const cell = row[fieldId];
    if (!cell) {
        throw new Error(`Query result did not include field ${fieldId}`);
    }
    return cell.value.raw;
};

describe('average_distinct fanout deduplication', () => {
    const projectUuid = SEED_PROJECT.project_uuid;
    let admin: ApiClient;

    beforeAll(async () => {
        admin = await login();
    });

    it('average_distinct should match AVG on a non-fanned-out table', async () => {
        const ordersQuery = {
            exploreName: 'orders',
            dimensions: [],
            metrics: ['orders_average_order_amount'],
            filters: {},
            sorts: [
                {
                    fieldId: 'orders_average_order_amount',
                    descending: true,
                },
            ],
            limit: 500,
            tableCalculations: [],
            additionalMetrics: [],
            metricOverrides: {},
        };

        const customersQuery = {
            exploreName: 'customers',
            dimensions: [],
            metrics: ['customers_avg_order_amount_deduped'],
            filters: {},
            sorts: [
                {
                    fieldId: 'customers_avg_order_amount_deduped',
                    descending: true,
                },
            ],
            limit: 500,
            tableCalculations: [],
            additionalMetrics: [],
            metricOverrides: {},
        };

        const ordersRows = await runMetricQuery(
            admin,
            projectUuid,
            ordersQuery,
        );
        expect(ordersRows).toHaveLength(1);

        const ordersAvgAmount = Number(
            getRawValue(ordersRows[0], 'orders_average_order_amount'),
        );
        expect(ordersAvgAmount).toBeGreaterThan(0);
        expect(ordersAvgAmount % 1).not.toBe(0);

        const customersRows = await runMetricQuery(
            admin,
            projectUuid,
            customersQuery,
        );
        expect(customersRows).toHaveLength(1);

        const customersDedupedAvg = Number(
            getRawValue(customersRows[0], 'customers_avg_order_amount_deduped'),
        );
        expect(
            Math.abs(customersDedupedAvg - ordersAvgAmount),
        ).toBeLessThanOrEqual(0.01);
    });

    it('average_distinct should return NULL when all values are NULL', async () => {
        const customersQuery = {
            exploreName: 'customers',
            dimensions: [],
            metrics: ['customers_avg_order_amount_deduped'],
            filters: {
                dimensions: {
                    id: 'root',
                    and: [
                        {
                            id: 'filter-null-amounts',
                            target: {
                                fieldId: 'orders_amount',
                            },
                            operator: 'isNull',
                            values: [],
                        },
                    ],
                },
            },
            sorts: [
                {
                    fieldId: 'customers_avg_order_amount_deduped',
                    descending: true,
                },
            ],
            limit: 500,
            tableCalculations: [],
            additionalMetrics: [],
            metricOverrides: {},
        };

        const rows = await runMetricQuery(admin, projectUuid, customersQuery);
        expect(rows).toHaveLength(1);
        expect(
            getRawValue(rows[0], 'customers_avg_order_amount_deduped'),
        ).toBeNull();
    });
});
