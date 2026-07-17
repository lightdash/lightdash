import {
    assertUnreachable,
    QueryHistoryStatus,
    SEED_PROJECT,
    type ApiExecuteAsyncMetricQueryResults,
    type ApiGetAsyncQueryResults,
    type ResultRow,
} from '@lightdash/common';
import { beforeAll, describe, expect, it } from 'vitest';
import { ApiClient, Body } from '../helpers/api-client';
import { login } from '../helpers/auth';

const apiUrl = '/api/v2';
const pollIntervalMs = 200;
const queryTimeoutMs = 60_000;

const wait = async (milliseconds: number): Promise<void> =>
    new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
    });

const runMetricQuery = async (
    client: ApiClient,
    projectUuid: string,
    query: Record<string, unknown>,
): Promise<ResultRow[]> => {
    const executeResponse = await client.post<
        Body<ApiExecuteAsyncMetricQueryResults>
    >(`${apiUrl}/projects/${projectUuid}/query/metric-query`, {
        context: 'exploreView',
        query,
    });
    expect(executeResponse.status).toBe(200);

    const { queryUuid } = executeResponse.body.results;
    const deadline = Date.now() + queryTimeoutMs;
    let lastStatus: QueryHistoryStatus | null = null;

    while (Date.now() < deadline) {
        const response = await client.get<Body<ApiGetAsyncQueryResults>>(
            `${apiUrl}/projects/${projectUuid}/query/${queryUuid}`,
        );
        expect(response.status).toBe(200);

        const { results } = response.body;
        lastStatus = results.status;

        switch (results.status) {
            case QueryHistoryStatus.READY:
                return results.rows;
            case QueryHistoryStatus.ERROR:
            case QueryHistoryStatus.EXPIRED:
                throw new Error(
                    `Query ${queryUuid} failed with status ${results.status}: ${results.error ?? 'No error provided'}`,
                );
            case QueryHistoryStatus.CANCELLED:
                throw new Error(
                    `Query ${queryUuid} failed with status ${results.status}: No error provided`,
                );
            case QueryHistoryStatus.PENDING:
            case QueryHistoryStatus.QUEUED:
            case QueryHistoryStatus.EXECUTING:
                await wait(pollIntervalMs);
                break;
            default:
                return assertUnreachable(
                    results,
                    `Query ${queryUuid} returned an unknown status`,
                );
        }
    }

    throw new Error(
        `Query ${queryUuid} timed out after ${queryTimeoutMs}ms with status ${lastStatus ?? 'unknown'}`,
    );
};

const getRawValue = (row: ResultRow, fieldId: string): unknown => {
    const field = row[fieldId];
    if (field === undefined) {
        throw new Error(`Query result is missing field ${fieldId}`);
    }
    return field.value.raw;
};

describe('SQL fanout deduplication', () => {
    const projectUuid = SEED_PROJECT.project_uuid;
    let admin: ApiClient;

    beforeAll(async () => {
        admin = await login();
    });

    it('sum_distinct should prevent SQL fanout inflation when joining customers to orders', async () => {
        const ordersQuery = {
            exploreName: 'orders',
            dimensions: [],
            metrics: ['orders_total_order_amount'],
            filters: {},
            sorts: [
                {
                    fieldId: 'orders_total_order_amount',
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
            metrics: ['customers_total_order_amount_deduped'],
            filters: {},
            sorts: [
                {
                    fieldId: 'customers_total_order_amount_deduped',
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

        const ordersTotalAmount = Number(
            getRawValue(ordersRows[0], 'orders_total_order_amount'),
        );
        expect(ordersTotalAmount).toBeGreaterThan(0);

        const customersRows = await runMetricQuery(
            admin,
            projectUuid,
            customersQuery,
        );
        expect(customersRows).toHaveLength(1);

        const customersDedupedAmount = Number(
            getRawValue(
                customersRows[0],
                'customers_total_order_amount_deduped',
            ),
        );
        expect(customersDedupedAmount).toBe(ordersTotalAmount);
    });

    it('sum_distinct should return grouped values when the user selects distinct keys as dimensions', async () => {
        const totalQuery = {
            exploreName: 'customer_order_payments',
            dimensions: [],
            metrics: [
                'customer_order_payments_total_payment_by_method_per_order',
            ],
            filters: {},
            sorts: [],
            limit: 500,
            tableCalculations: [],
            additionalMetrics: [],
            metricOverrides: {},
        };

        const dedupedQuery = {
            exploreName: 'customer_order_payments',
            dimensions: [
                'customer_order_payments_order_id',
                'customer_order_payments_payment_method',
            ],
            metrics: [
                'customer_order_payments_total_payment_by_method_per_order',
            ],
            filters: {},
            sorts: [
                {
                    fieldId: 'customer_order_payments_order_id',
                    descending: false,
                },
                {
                    fieldId: 'customer_order_payments_payment_method',
                    descending: false,
                },
            ],
            limit: 500,
            tableCalculations: [],
            additionalMetrics: [],
            metricOverrides: {},
        };

        const totalRows = await runMetricQuery(admin, projectUuid, totalQuery);
        expect(totalRows).toHaveLength(1);

        const total = Number(
            getRawValue(
                totalRows[0],
                'customer_order_payments_total_payment_by_method_per_order',
            ),
        );
        expect(total).toBeGreaterThan(0);

        const dedupedRows = await runMetricQuery(
            admin,
            projectUuid,
            dedupedQuery,
        );
        expect(dedupedRows.length).toBeGreaterThan(1);

        const groupedValues = dedupedRows.map((row) =>
            Number(
                getRawValue(
                    row,
                    'customer_order_payments_total_payment_by_method_per_order',
                ),
            ),
        );
        const groupedSum = Number(
            groupedValues.reduce((sum, value) => sum + value, 0).toFixed(2),
        );

        expect(new Set(groupedValues).size).toBeGreaterThan(1);
        expect(groupedSum).toBe(total);

        for (const row of dedupedRows) {
            expect(
                getRawValue(row, 'customer_order_payments_order_id'),
            ).not.toBeNull();
            expect(
                getRawValue(row, 'customer_order_payments_payment_method'),
            ).not.toBeNull();
        }
    });

    it('sum_distinct grouped by dimension outside distinct_keys should return per-group values', async () => {
        const totalQuery = {
            exploreName: 'customer_order_payments',
            dimensions: [],
            metrics: ['customer_order_payments_total_payment_amount_deduped'],
            filters: {},
            sorts: [],
            limit: 500,
            tableCalculations: [],
            additionalMetrics: [],
            metricOverrides: {},
        };

        const wideTableQuery = {
            exploreName: 'customer_order_payments',
            dimensions: ['customer_order_payments_payment_method'],
            metrics: ['customer_order_payments_total_payment_amount_deduped'],
            filters: {},
            sorts: [
                {
                    fieldId: 'customer_order_payments_payment_method',
                    descending: false,
                },
            ],
            limit: 500,
            tableCalculations: [],
            additionalMetrics: [],
            metricOverrides: {},
        };

        const totalRows = await runMetricQuery(admin, projectUuid, totalQuery);
        expect(totalRows).toHaveLength(1);

        const total = Number(
            getRawValue(
                totalRows[0],
                'customer_order_payments_total_payment_amount_deduped',
            ),
        );
        expect(total).toBeGreaterThan(0);

        const wideTableRows = await runMetricQuery(
            admin,
            projectUuid,
            wideTableQuery,
        );
        expect(wideTableRows.length).toBeGreaterThan(1);

        const groupedValues = wideTableRows.map((row) =>
            Number(
                getRawValue(
                    row,
                    'customer_order_payments_total_payment_amount_deduped',
                ),
            ),
        );
        const groupedSum = Number(
            groupedValues.reduce((sum, value) => sum + value, 0).toFixed(2),
        );

        expect(new Set(groupedValues).size).toBeGreaterThan(1);
        expect(groupedSum).toBe(total);
    });
});
