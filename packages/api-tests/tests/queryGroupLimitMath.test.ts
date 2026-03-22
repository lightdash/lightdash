import {
    ApiExecuteAsyncMetricQueryResults,
    ApiGetAsyncQueryResults,
    OTHER_GROUP_SENTINEL_VALUE,
    QueryExecutionContext,
    QueryHistoryStatus,
    ReadyQueryResultsPage,
    SEED_PROJECT,
    VizAggregationOptions,
    type ExecuteAsyncMetricQueryRequestParams,
    type ResultRow,
    type ValuesColumn,
} from '@lightdash/common';
import { beforeAll, describe, expect, it } from 'vitest';
import { ApiClient, Body } from '../helpers/api-client';
import { login } from '../helpers/auth';

const apiUrl = '/api/v2';
const defaultLimit = 500;
const queryTimeoutMs = 30_000;
const pollIntervalMs = 200;

type SortField = {
    fieldId: string;
    descending: boolean;
};

type MetricOtherExpectation = {
    metricReference: string;
    expectedOtherValue: number;
};

type SupportedGroupLimitCase = {
    name: string;
    exploreName: string;
    groupFieldId: string;
    metrics: string[];
    pivotValuesColumns: ValuesColumn[];
    sorts: SortField[];
    expectedVisibleGroups: string[];
    expectedOtherValues: MetricOtherExpectation[];
    expectedTotalGroupCount: number;
};

const supportedGroupLimitCases: SupportedGroupLimitCase[] = [
    {
        name: 'matches raw truth for count_distinct grouped by month',
        exploreName: 'customers',
        groupFieldId: 'orders_order_date_month',
        metrics: ['customers_unique_customer_count'],
        pivotValuesColumns: [
            {
                reference: 'customers_unique_customer_count',
                aggregation: VizAggregationOptions.SUM,
                otherAggregation: VizAggregationOptions.SUM,
            },
        ],
        sorts: [
            {
                fieldId: 'customers_unique_customer_count',
                descending: true,
            },
        ],
        expectedVisibleGroups: ['2024-06-01', '2025-01-01'],
        expectedOtherValues: [
            {
                metricReference: 'customers_unique_customer_count',
                expectedOtherValue: 70,
            },
        ],
        expectedTotalGroupCount: 27,
    },
    {
        name: 'matches raw truth for sum_distinct grouped by payment method',
        exploreName: 'customers',
        groupFieldId: 'payments_payment_method',
        metrics: ['customers_total_order_amount_deduped'],
        pivotValuesColumns: [
            {
                reference: 'customers_total_order_amount_deduped',
                aggregation: VizAggregationOptions.SUM,
            },
        ],
        sorts: [
            {
                fieldId: 'customers_total_order_amount_deduped',
                descending: true,
            },
        ],
        expectedVisibleGroups: ['bank_transfer', 'credit_card'],
        expectedOtherValues: [
            {
                metricReference: 'customers_total_order_amount_deduped',
                expectedOtherValue: 1503.68,
            },
        ],
        expectedTotalGroupCount: 5,
    },
    {
        name: 'matches raw truth for average_distinct grouped by payment method',
        exploreName: 'customers',
        groupFieldId: 'payments_payment_method',
        metrics: ['customers_avg_order_amount_deduped'],
        pivotValuesColumns: [
            {
                reference: 'customers_avg_order_amount_deduped',
                aggregation: VizAggregationOptions.AVERAGE,
            },
        ],
        sorts: [
            {
                fieldId: 'customers_avg_order_amount_deduped',
                descending: true,
            },
        ],
        expectedVisibleGroups: ['credit_card', 'gift_card'],
        expectedOtherValues: [
            {
                metricReference: 'customers_avg_order_amount_deduped',
                expectedOtherValue: 26.33953846153846,
            },
        ],
        expectedTotalGroupCount: 5,
    },
    {
        name: 'matches raw truth for average grouped by payment method',
        exploreName: 'customers',
        groupFieldId: 'payments_payment_method',
        metrics: ['orders_average_order_amount'],
        pivotValuesColumns: [
            {
                reference: 'orders_average_order_amount',
                aggregation: VizAggregationOptions.AVERAGE,
            },
        ],
        sorts: [
            {
                fieldId: 'orders_average_order_amount',
                descending: true,
            },
        ],
        expectedVisibleGroups: ['credit_card', 'gift_card'],
        expectedOtherValues: [
            {
                metricReference: 'orders_average_order_amount',
                expectedOtherValue: 26.33953846153846,
            },
        ],
        expectedTotalGroupCount: 5,
    },
    {
        name: 'matches raw truth for mixed sum plus count_distinct',
        exploreName: 'customers',
        groupFieldId: 'payments_payment_method',
        metrics: [
            'customers_total_order_amount_inflated',
            'customers_unique_customer_count',
        ],
        pivotValuesColumns: [
            {
                reference: 'customers_total_order_amount_inflated',
                aggregation: VizAggregationOptions.SUM,
            },
            {
                reference: 'customers_unique_customer_count',
                aggregation: VizAggregationOptions.SUM,
                otherAggregation: VizAggregationOptions.SUM,
            },
        ],
        sorts: [
            {
                fieldId: 'customers_total_order_amount_inflated',
                descending: true,
            },
        ],
        expectedVisibleGroups: ['bank_transfer', 'credit_card'],
        expectedOtherValues: [
            {
                metricReference: 'customers_total_order_amount_inflated',
                expectedOtherValue: 1875.61,
            },
            {
                metricReference: 'customers_unique_customer_count',
                expectedOtherValue: 53,
            },
        ],
        expectedTotalGroupCount: 5,
    },
    {
        name: 'matches raw truth for mixed sum plus average',
        exploreName: 'customers',
        groupFieldId: 'payments_payment_method',
        metrics: [
            'customers_total_order_amount_inflated',
            'orders_average_order_amount',
        ],
        pivotValuesColumns: [
            {
                reference: 'customers_total_order_amount_inflated',
                aggregation: VizAggregationOptions.SUM,
            },
            {
                reference: 'orders_average_order_amount',
                aggregation: VizAggregationOptions.AVERAGE,
            },
        ],
        sorts: [
            {
                fieldId: 'customers_total_order_amount_inflated',
                descending: true,
            },
        ],
        expectedVisibleGroups: ['bank_transfer', 'credit_card'],
        expectedOtherValues: [
            {
                metricReference: 'customers_total_order_amount_inflated',
                expectedOtherValue: 1875.61,
            },
            {
                metricReference: 'orders_average_order_amount',
                expectedOtherValue: 31.993191489361703,
            },
        ],
        expectedTotalGroupCount: 5,
    },
];

const unsupportedNumberMetricCase = {
    exploreName: 'customers',
    groupFieldId: 'payments_payment_method',
    metrics: ['orders_completion_percentage'],
    pivotValuesColumns: [
        {
            reference: 'orders_completion_percentage',
            aggregation: VizAggregationOptions.AVERAGE,
        },
    ],
    sorts: [
        {
            fieldId: 'orders_completion_percentage',
            descending: true,
        },
    ],
    expectedVisibleGroups: ['coupon', 'credit_card'],
    expectedGroupedTruthValue: 0.5687348690942671,
    expectedTotalGroupCount: 5,
} satisfies Omit<SupportedGroupLimitCase, 'name' | 'expectedOtherValues'> & {
    expectedGroupedTruthValue: number;
};

let admin: ApiClient;

const sleep = async (ms: number) =>
    new Promise((resolve) => {
        setTimeout(resolve, ms);
    });

const fail = (message: string): never => {
    // eslint-disable-next-line @typescript-eslint/no-throw-literal
    throw new globalThis.Error(message);
};

const buildMetricQueryRequest = ({
    exploreName,
    dimensions,
    metrics,
    filters = {},
    sorts,
    pivotDimensions = [],
    pivotValuesColumns,
}: {
    exploreName: string;
    dimensions: string[];
    metrics: string[];
    filters?: ExecuteAsyncMetricQueryRequestParams['query']['filters'];
    sorts: SortField[];
    pivotDimensions?: string[];
    pivotValuesColumns?: ValuesColumn[];
}): ExecuteAsyncMetricQueryRequestParams => ({
    context: QueryExecutionContext.EXPLORE,
    query: {
        exploreName,
        dimensions,
        metrics,
        filters,
        sorts,
        limit: defaultLimit,
        tableCalculations: [],
        additionalMetrics: [],
        customDimensions: [],
        metricOverrides: {},
        dimensionOverrides: {},
        timezone: 'UTC',
        pivotDimensions,
    },
    ...(pivotValuesColumns
        ? {
              pivotConfiguration: {
                  indexColumn: [],
                  valuesColumns: pivotValuesColumns,
                  groupByColumns: [{ reference: dimensions[0] }],
                  sortBy: undefined,
                  groupLimit: { enabled: true, maxGroups: 2 },
              },
          }
        : {}),
});

const buildNotEqualsFilter = (
    fieldId: string,
    values: (string | boolean)[],
): NonNullable<ExecuteAsyncMetricQueryRequestParams['query']['filters']> => ({
    dimensions: {
        id: 'root',
        and: [
            {
                id: `exclude-${fieldId}`,
                target: { fieldId },
                operator: 'notEquals',
                values,
            },
        ],
    },
});

const toNumber = (value: unknown): number => {
    if (typeof value === 'number') {
        return value;
    }

    if (typeof value === 'string') {
        const parsed = Number(value);
        if (!Number.isNaN(parsed)) {
            return parsed;
        }
    }

    return fail(`Expected numeric value but received ${String(value)}`);
};

const getCell = (row: ResultRow, columnName: string) => {
    const cell = row[columnName];
    if (!cell || typeof cell !== 'object' || !('value' in cell)) {
        return fail(`Column "${columnName}" was not returned in row`);
    }

    return cell;
};

const normalizeTimestamp = (value: string): string => {
    const isoMatch = /^(\d{4}-\d{2}-\d{2})T/.exec(value);
    if (isoMatch) {
        return isoMatch[1];
    }
    return value;
};

const getPivotGroupValues = (results: ReadyQueryResultsPage): string[] => {
    if (!results.pivotDetails) {
        return fail('Expected pivot details to be present');
    }

    const visibleGroups = new Set<string>();

    results.pivotDetails.valuesColumns.forEach((column) => {
        const groupValue = column.pivotValues[0]?.value;
        if (groupValue !== undefined) {
            visibleGroups.add(normalizeTimestamp(String(groupValue)));
        }
    });

    return Array.from(visibleGroups);
};

const getPivotMetricValue = ({
    results,
    metricReference,
    groupValue,
}: {
    results: ReadyQueryResultsPage;
    metricReference: string;
    groupValue: string;
}): number => {
    if (!results.pivotDetails) {
        return fail('Expected pivot details to be present');
    }

    const pivotColumn = results.pivotDetails.valuesColumns.find(
        (column) =>
            column.referenceField === metricReference &&
            column.pivotValues[0]?.value === groupValue,
    );

    if (!pivotColumn) {
        return fail(
            `No pivot column found for ${metricReference} / ${groupValue}`,
        );
    }

    return toNumber(
        getCell(results.rows[0], pivotColumn.pivotColumnName).value.raw,
    );
};

const getMetricValue = ({
    results,
    metricReference,
}: {
    results: ReadyQueryResultsPage;
    metricReference: string;
}): number => toNumber(getCell(results.rows[0], metricReference).value.raw);

async function pollQueryResults(
    client: ApiClient,
    projectUuid: string,
    queryUuid: string,
): Promise<ReadyQueryResultsPage> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < queryTimeoutMs) {
        const response = await client.get<Body<ApiGetAsyncQueryResults>>(
            `${apiUrl}/projects/${projectUuid}/query/${queryUuid}`,
        );
        const { status } = response.body.results;

        switch (status) {
            case QueryHistoryStatus.READY:
                return response.body.results;
            case QueryHistoryStatus.ERROR:
            case QueryHistoryStatus.EXPIRED:
                return fail(
                    `Query ${queryUuid} failed: ${response.body.results.error}`,
                );
            case QueryHistoryStatus.PENDING:
            case QueryHistoryStatus.QUEUED:
            case QueryHistoryStatus.EXECUTING:
            case QueryHistoryStatus.CANCELLED:
                await sleep(pollIntervalMs);
                break;
            default:
                return fail(`Unexpected query status ${String(status)}`);
        }
    }

    return fail(`Timed out waiting for query ${queryUuid}`);
}

async function runMetricQuery(
    client: ApiClient,
    projectUuid: string,
    body: ExecuteAsyncMetricQueryRequestParams,
): Promise<ReadyQueryResultsPage> {
    const response = await client.post<Body<ApiExecuteAsyncMetricQueryResults>>(
        `${apiUrl}/projects/${projectUuid}/query/metric-query`,
        body,
    );

    expect(response.status).toBe(200);

    return pollQueryResults(
        client,
        projectUuid,
        response.body.results.queryUuid,
    );
}

beforeAll(async () => {
    admin = await login();
});

describe('v2 query group limit baselines', () => {
    it.each(supportedGroupLimitCases)('$name', async (testCase) => {
        const pivotResults = await runMetricQuery(
            admin,
            SEED_PROJECT.project_uuid,
            buildMetricQueryRequest({
                exploreName: testCase.exploreName,
                dimensions: [testCase.groupFieldId],
                metrics: testCase.metrics,
                sorts: testCase.sorts,
                pivotDimensions: [testCase.groupFieldId],
                pivotValuesColumns: testCase.pivotValuesColumns,
            }),
        );

        expect(getPivotGroupValues(pivotResults).sort()).toEqual(
            [...testCase.expectedVisibleGroups, OTHER_GROUP_SENTINEL_VALUE]
                .map(normalizeTimestamp)
                .sort(),
        );
        expect(pivotResults.pivotDetails?.totalGroupCount).toBe(
            testCase.expectedTotalGroupCount,
        );

        testCase.expectedOtherValues.forEach(
            ({ metricReference, expectedOtherValue }) => {
                expect(
                    getPivotMetricValue({
                        results: pivotResults,
                        metricReference,
                        groupValue: OTHER_GROUP_SENTINEL_VALUE,
                    }),
                ).toBeCloseTo(expectedOtherValue, 12);
            },
        );

        const truthResults = await runMetricQuery(
            admin,
            SEED_PROJECT.project_uuid,
            buildMetricQueryRequest({
                exploreName: testCase.exploreName,
                dimensions: [],
                metrics: testCase.metrics,
                filters: buildNotEqualsFilter(
                    testCase.groupFieldId,
                    testCase.expectedVisibleGroups,
                ),
                sorts: testCase.sorts,
            }),
        );

        testCase.expectedOtherValues.forEach(
            ({ metricReference, expectedOtherValue }) => {
                expect(
                    getMetricValue({
                        results: truthResults,
                        metricReference,
                    }),
                ).toBeCloseTo(expectedOtherValue, 12);
            },
        );

        const groupedResults = await runMetricQuery(
            admin,
            SEED_PROJECT.project_uuid,
            buildMetricQueryRequest({
                exploreName: testCase.exploreName,
                dimensions: [testCase.groupFieldId],
                metrics: [testCase.metrics[0]],
                sorts: testCase.sorts,
            }),
        );

        expect(groupedResults.totalResults).toBe(
            testCase.expectedTotalGroupCount,
        );
    });

    it('drops unsupported number metrics instead of emitting incorrect Other math', async () => {
        const pivotResults = await runMetricQuery(
            admin,
            SEED_PROJECT.project_uuid,
            buildMetricQueryRequest({
                exploreName: unsupportedNumberMetricCase.exploreName,
                dimensions: [unsupportedNumberMetricCase.groupFieldId],
                metrics: unsupportedNumberMetricCase.metrics,
                sorts: unsupportedNumberMetricCase.sorts,
                pivotDimensions: [unsupportedNumberMetricCase.groupFieldId],
                pivotValuesColumns:
                    unsupportedNumberMetricCase.pivotValuesColumns,
            }),
        );

        expect(getPivotGroupValues(pivotResults)).toEqual(
            unsupportedNumberMetricCase.expectedVisibleGroups,
        );
        expect(pivotResults.pivotDetails?.totalGroupCount).toBe(
            unsupportedNumberMetricCase.expectedTotalGroupCount,
        );

        const truthResults = await runMetricQuery(
            admin,
            SEED_PROJECT.project_uuid,
            buildMetricQueryRequest({
                exploreName: unsupportedNumberMetricCase.exploreName,
                dimensions: [],
                metrics: unsupportedNumberMetricCase.metrics,
                filters: buildNotEqualsFilter(
                    unsupportedNumberMetricCase.groupFieldId,
                    unsupportedNumberMetricCase.expectedVisibleGroups,
                ),
                sorts: unsupportedNumberMetricCase.sorts,
            }),
        );

        expect(
            getMetricValue({
                results: truthResults,
                metricReference: 'orders_completion_percentage',
            }),
        ).toBeCloseTo(
            unsupportedNumberMetricCase.expectedGroupedTruthValue,
            12,
        );
    });
});
