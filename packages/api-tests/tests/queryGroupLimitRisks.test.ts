import {
    ApiExecuteAsyncMetricQueryResults,
    ApiGetAsyncQueryResults,
    OTHER_GROUP_DISPLAY_VALUE,
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

let admin: ApiClient;

const sleep = async (ms: number) =>
    new Promise((resolve) => {
        setTimeout(resolve, ms);
    });

const fail = (message: string): never => {
    // eslint-disable-next-line @typescript-eslint/no-throw-literal
    throw new globalThis.Error(message);
};

const toNumber = (value: unknown): number => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const parsed = Number(value);
        if (!Number.isNaN(parsed)) return parsed;
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

const getPivotGroupValues = (results: ReadyQueryResultsPage): string[] => {
    if (!results.pivotDetails) return fail('Expected pivot details');
    const visibleGroups = new Set<string>();
    results.pivotDetails.valuesColumns.forEach((column) => {
        const groupValue = column.pivotValues[0]?.value;
        if (groupValue !== undefined) visibleGroups.add(String(groupValue));
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
    if (!results.pivotDetails) return fail('Expected pivot details');
    const pivotColumn = results.pivotDetails.valuesColumns.find(
        (column) =>
            column.referenceField === metricReference &&
            column.pivotValues[0]?.value === groupValue,
    );
    if (!pivotColumn) {
        return fail(`No pivot column for ${metricReference} / ${groupValue}`);
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

function buildGroupLimitRequest({
    exploreName,
    dimensions,
    metrics,
    filters = {},
    sorts,
    pivotDimensions = [],
    pivotValuesColumns,
    maxGroups,
    groupLimitEnabled = true,
}: {
    exploreName: string;
    dimensions: string[];
    metrics: string[];
    filters?: ExecuteAsyncMetricQueryRequestParams['query']['filters'];
    sorts: SortField[];
    pivotDimensions?: string[];
    pivotValuesColumns: ValuesColumn[];
    maxGroups: number;
    groupLimitEnabled?: boolean;
}): ExecuteAsyncMetricQueryRequestParams {
    return {
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
        pivotConfiguration: {
            indexColumn: [],
            valuesColumns: pivotValuesColumns,
            groupByColumns: [{ reference: dimensions[0] }],
            sortBy: undefined,
            groupLimit: { enabled: groupLimitEnabled, maxGroups },
        },
    };
}

function buildNoGroupLimitRequest({
    exploreName,
    dimensions,
    metrics,
    filters = {},
    sorts,
}: {
    exploreName: string;
    dimensions: string[];
    metrics: string[];
    filters?: ExecuteAsyncMetricQueryRequestParams['query']['filters'];
    sorts: SortField[];
}): ExecuteAsyncMetricQueryRequestParams {
    return {
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
            pivotDimensions: [],
        },
    };
}

const paymentMethodConfig = {
    exploreName: 'customers',
    groupFieldId: 'payments_payment_method',
    metric: 'customers_total_order_amount_inflated',
    valuesColumns: [
        {
            reference: 'customers_total_order_amount_inflated',
            aggregation: VizAggregationOptions.SUM,
        },
    ] as ValuesColumn[],
    sorts: [
        { fieldId: 'customers_total_order_amount_inflated', descending: true },
    ] as SortField[],
};

beforeAll(async () => {
    admin = await login();
});

// ---------------------------------------------------------------------------
// Test 1.7: Metric values sum correctly across "Other" and top groups
// Risk: General correctness — top-N + Other must equal ungrouped total
// ---------------------------------------------------------------------------
describe('R-General: sum correctness across Other and top groups (Test 1.7)', () => {
    it('top-2 groups + Other sum equals ungrouped total for SUM metric', async () => {
        const pivotResults = await runMetricQuery(
            admin,
            SEED_PROJECT.project_uuid,
            buildGroupLimitRequest({
                exploreName: paymentMethodConfig.exploreName,
                dimensions: [paymentMethodConfig.groupFieldId],
                metrics: [paymentMethodConfig.metric],
                sorts: paymentMethodConfig.sorts,
                pivotDimensions: [paymentMethodConfig.groupFieldId],
                pivotValuesColumns: paymentMethodConfig.valuesColumns,
                maxGroups: 2,
            }),
        );

        const groups = getPivotGroupValues(pivotResults);
        expect(groups).toContain(OTHER_GROUP_SENTINEL_VALUE);

        const topGroups = groups.filter(
            (g) => g !== OTHER_GROUP_SENTINEL_VALUE,
        );
        expect(topGroups).toHaveLength(2);

        let pivotTotal = 0;
        for (const group of groups) {
            pivotTotal += getPivotMetricValue({
                results: pivotResults,
                metricReference: paymentMethodConfig.metric,
                groupValue: group,
            });
        }

        const allGroupsResults = await runMetricQuery(
            admin,
            SEED_PROJECT.project_uuid,
            buildGroupLimitRequest({
                exploreName: paymentMethodConfig.exploreName,
                dimensions: [paymentMethodConfig.groupFieldId],
                metrics: [paymentMethodConfig.metric],
                sorts: paymentMethodConfig.sorts,
                pivotDimensions: [paymentMethodConfig.groupFieldId],
                pivotValuesColumns: paymentMethodConfig.valuesColumns,
                maxGroups: 100,
            }),
        );

        let allGroupsTotal = 0;
        for (const col of allGroupsResults.pivotDetails!.valuesColumns) {
            const raw =
                allGroupsResults.rows[0][col.pivotColumnName]?.value?.raw;
            if (raw !== null && raw !== undefined) {
                allGroupsTotal += toNumber(raw);
            }
        }

        expect(pivotTotal).toBeCloseTo(allGroupsTotal, 2);
    });
});

// ---------------------------------------------------------------------------
// Test 1.4: maxGroups changes produce different results (R9 — partial)
// Risk: Cache key must include groupLimit config
// ---------------------------------------------------------------------------
describe('R9-partial: maxGroups changes produce different results (Test 1.4)', () => {
    it('maxGroups:2 Other value > maxGroups:3 Other value', async () => {
        const results2 = await runMetricQuery(
            admin,
            SEED_PROJECT.project_uuid,
            buildGroupLimitRequest({
                exploreName: paymentMethodConfig.exploreName,
                dimensions: [paymentMethodConfig.groupFieldId],
                metrics: [paymentMethodConfig.metric],
                sorts: paymentMethodConfig.sorts,
                pivotDimensions: [paymentMethodConfig.groupFieldId],
                pivotValuesColumns: paymentMethodConfig.valuesColumns,
                maxGroups: 2,
            }),
        );

        const results3 = await runMetricQuery(
            admin,
            SEED_PROJECT.project_uuid,
            buildGroupLimitRequest({
                exploreName: paymentMethodConfig.exploreName,
                dimensions: [paymentMethodConfig.groupFieldId],
                metrics: [paymentMethodConfig.metric],
                sorts: paymentMethodConfig.sorts,
                pivotDimensions: [paymentMethodConfig.groupFieldId],
                pivotValuesColumns: paymentMethodConfig.valuesColumns,
                maxGroups: 3,
            }),
        );

        const groups2 = getPivotGroupValues(results2);
        const groups3 = getPivotGroupValues(results3);

        expect(groups2).toContain(OTHER_GROUP_SENTINEL_VALUE);
        expect(groups3).toContain(OTHER_GROUP_SENTINEL_VALUE);

        const other2 = getPivotMetricValue({
            results: results2,
            metricReference: paymentMethodConfig.metric,
            groupValue: OTHER_GROUP_SENTINEL_VALUE,
        });

        const other3 = getPivotMetricValue({
            results: results3,
            metricReference: paymentMethodConfig.metric,
            groupValue: OTHER_GROUP_SENTINEL_VALUE,
        });

        expect(other2).toBeGreaterThan(other3);

        expect(results2.pivotDetails?.totalGroupCount).toBe(
            results3.pivotDetails?.totalGroupCount,
        );
    });
});

// ---------------------------------------------------------------------------
// Test 1.8: maxGroups boundary values
// Risk: Edge cases in Math.max(1, Math.floor(groupLimit.maxGroups))
// ---------------------------------------------------------------------------
describe('R-Edge: maxGroups boundary values (Test 1.8)', () => {
    it('1.8a — maxGroups = 1: only 1 top group, rest in Other', async () => {
        const results = await runMetricQuery(
            admin,
            SEED_PROJECT.project_uuid,
            buildGroupLimitRequest({
                exploreName: paymentMethodConfig.exploreName,
                dimensions: [paymentMethodConfig.groupFieldId],
                metrics: [paymentMethodConfig.metric],
                sorts: paymentMethodConfig.sorts,
                pivotDimensions: [paymentMethodConfig.groupFieldId],
                pivotValuesColumns: paymentMethodConfig.valuesColumns,
                maxGroups: 1,
            }),
        );

        const groups = getPivotGroupValues(results);
        const topGroups = groups.filter(
            (g) => g !== OTHER_GROUP_SENTINEL_VALUE,
        );
        expect(topGroups).toHaveLength(1);
        expect(groups).toContain(OTHER_GROUP_SENTINEL_VALUE);
    });

    it('1.8b — maxGroups = total groups: no Other row', async () => {
        const totalGroupCount =
            (
                await runMetricQuery(
                    admin,
                    SEED_PROJECT.project_uuid,
                    buildGroupLimitRequest({
                        exploreName: paymentMethodConfig.exploreName,
                        dimensions: [paymentMethodConfig.groupFieldId],
                        metrics: [paymentMethodConfig.metric],
                        sorts: paymentMethodConfig.sorts,
                        pivotDimensions: [paymentMethodConfig.groupFieldId],
                        pivotValuesColumns: paymentMethodConfig.valuesColumns,
                        maxGroups: 100,
                    }),
                )
            ).pivotDetails?.totalGroupCount ?? fail('No totalGroupCount');

        const results = await runMetricQuery(
            admin,
            SEED_PROJECT.project_uuid,
            buildGroupLimitRequest({
                exploreName: paymentMethodConfig.exploreName,
                dimensions: [paymentMethodConfig.groupFieldId],
                metrics: [paymentMethodConfig.metric],
                sorts: paymentMethodConfig.sorts,
                pivotDimensions: [paymentMethodConfig.groupFieldId],
                pivotValuesColumns: paymentMethodConfig.valuesColumns,
                maxGroups: totalGroupCount,
            }),
        );

        const groups = getPivotGroupValues(results);
        expect(groups).not.toContain(OTHER_GROUP_SENTINEL_VALUE);
        expect(groups).toHaveLength(totalGroupCount);
    });

    it('1.8c — maxGroups = 100 (exceeds total): same as no group limit', async () => {
        const resultsHigh = await runMetricQuery(
            admin,
            SEED_PROJECT.project_uuid,
            buildGroupLimitRequest({
                exploreName: paymentMethodConfig.exploreName,
                dimensions: [paymentMethodConfig.groupFieldId],
                metrics: [paymentMethodConfig.metric],
                sorts: paymentMethodConfig.sorts,
                pivotDimensions: [paymentMethodConfig.groupFieldId],
                pivotValuesColumns: paymentMethodConfig.valuesColumns,
                maxGroups: 100,
            }),
        );

        const groups = getPivotGroupValues(resultsHigh);
        expect(groups).not.toContain(OTHER_GROUP_SENTINEL_VALUE);
    });

    it('1.8d — maxGroups = 0: clamped to 1', async () => {
        const results0 = await runMetricQuery(
            admin,
            SEED_PROJECT.project_uuid,
            buildGroupLimitRequest({
                exploreName: paymentMethodConfig.exploreName,
                dimensions: [paymentMethodConfig.groupFieldId],
                metrics: [paymentMethodConfig.metric],
                sorts: paymentMethodConfig.sorts,
                pivotDimensions: [paymentMethodConfig.groupFieldId],
                pivotValuesColumns: paymentMethodConfig.valuesColumns,
                maxGroups: 0,
            }),
        );

        const results1 = await runMetricQuery(
            admin,
            SEED_PROJECT.project_uuid,
            buildGroupLimitRequest({
                exploreName: paymentMethodConfig.exploreName,
                dimensions: [paymentMethodConfig.groupFieldId],
                metrics: [paymentMethodConfig.metric],
                sorts: paymentMethodConfig.sorts,
                pivotDimensions: [paymentMethodConfig.groupFieldId],
                pivotValuesColumns: paymentMethodConfig.valuesColumns,
                maxGroups: 1,
            }),
        );

        const groups0 = getPivotGroupValues(results0);
        const groups1 = getPivotGroupValues(results1);
        expect(groups0).toEqual(groups1);
    });
});

// ---------------------------------------------------------------------------
// Test 1.5: totalGroupCount accuracy across grouping modes (R10a)
// Risk: totalGroupCount computed from different sources per mode
// ---------------------------------------------------------------------------
describe('R10a: totalGroupCount accuracy (Test 1.5)', () => {
    it('1.5a — raw_other mode (COUNT_DISTINCT)', async () => {
        const results = await runMetricQuery(
            admin,
            SEED_PROJECT.project_uuid,
            buildGroupLimitRequest({
                exploreName: 'customers',
                dimensions: ['payments_payment_method'],
                metrics: ['customers_unique_customer_count'],
                sorts: [
                    {
                        fieldId: 'customers_unique_customer_count',
                        descending: true,
                    },
                ],
                pivotDimensions: ['payments_payment_method'],
                pivotValuesColumns: [
                    {
                        reference: 'customers_unique_customer_count',
                        aggregation: VizAggregationOptions.SUM,
                        otherAggregation: VizAggregationOptions.SUM,
                    },
                ],
                maxGroups: 2,
            }),
        );

        expect(results.pivotDetails?.totalGroupCount).toBe(5);
    });

    it('1.5b — fast_other mode (SUM)', async () => {
        const results = await runMetricQuery(
            admin,
            SEED_PROJECT.project_uuid,
            buildGroupLimitRequest({
                exploreName: paymentMethodConfig.exploreName,
                dimensions: [paymentMethodConfig.groupFieldId],
                metrics: [paymentMethodConfig.metric],
                sorts: paymentMethodConfig.sorts,
                pivotDimensions: [paymentMethodConfig.groupFieldId],
                pivotValuesColumns: paymentMethodConfig.valuesColumns,
                maxGroups: 2,
            }),
        );

        expect(results.pivotDetails?.totalGroupCount).toBe(5);
    });

    it('1.5c — group limit disabled', async () => {
        const results = await runMetricQuery(
            admin,
            SEED_PROJECT.project_uuid,
            buildGroupLimitRequest({
                exploreName: paymentMethodConfig.exploreName,
                dimensions: [paymentMethodConfig.groupFieldId],
                metrics: [paymentMethodConfig.metric],
                sorts: paymentMethodConfig.sorts,
                pivotDimensions: [paymentMethodConfig.groupFieldId],
                pivotValuesColumns: paymentMethodConfig.valuesColumns,
                maxGroups: 5,
                groupLimitEnabled: false,
            }),
        );

        const actualGroupCount = getPivotGroupValues(results).length;
        expect(results.pivotDetails?.totalGroupCount).toBe(actualGroupCount);
    });
});

// ---------------------------------------------------------------------------
// Test 1.2: Deterministic top-N ranking with tied values (R2)
// Risk: ROW_NUMBER without tiebreaker → non-deterministic results
// ---------------------------------------------------------------------------
describe('R2: deterministic top-N ranking (Test 1.2)', () => {
    it('5 consecutive runs return identical top groups', async () => {
        const topGroupSets: string[][] = [];

        for (let i = 0; i < 5; i++) {
            const results = await runMetricQuery(
                admin,
                SEED_PROJECT.project_uuid,
                buildGroupLimitRequest({
                    exploreName: paymentMethodConfig.exploreName,
                    dimensions: [paymentMethodConfig.groupFieldId],
                    metrics: [paymentMethodConfig.metric],
                    sorts: paymentMethodConfig.sorts,
                    pivotDimensions: [paymentMethodConfig.groupFieldId],
                    pivotValuesColumns: paymentMethodConfig.valuesColumns,
                    maxGroups: 3,
                }),
            );

            const topGroups = getPivotGroupValues(results)
                .filter((g) => g !== OTHER_GROUP_SENTINEL_VALUE)
                .sort();
            topGroupSets.push(topGroups);
        }

        for (let i = 1; i < topGroupSets.length; i++) {
            expect(topGroupSets[i]).toEqual(topGroupSets[0]);
        }
    });
});

// ---------------------------------------------------------------------------
// Test 1.3: "Other" sentinel collision documentation (R6)
// Risk: Seed data has no "Other" payment method, so we can only document
// the current behavior and flag the architectural risk
// ---------------------------------------------------------------------------
describe('R6: Other sentinel collision — architectural risk (Test 1.3)', () => {
    it('documents that display value and sentinel value are distinct constants', () => {
        expect(OTHER_GROUP_DISPLAY_VALUE).toBe('Other');
        expect(OTHER_GROUP_SENTINEL_VALUE).toBe('$$_lightdash_other_$$');
        expect(OTHER_GROUP_SENTINEL_VALUE).not.toBe(OTHER_GROUP_DISPLAY_VALUE);
    });

    it('API returns sentinel value (not display value) for Other pivot groups', async () => {
        const results = await runMetricQuery(
            admin,
            SEED_PROJECT.project_uuid,
            buildGroupLimitRequest({
                exploreName: paymentMethodConfig.exploreName,
                dimensions: [paymentMethodConfig.groupFieldId],
                metrics: [paymentMethodConfig.metric],
                sorts: paymentMethodConfig.sorts,
                pivotDimensions: [paymentMethodConfig.groupFieldId],
                pivotValuesColumns: paymentMethodConfig.valuesColumns,
                maxGroups: 2,
            }),
        );

        const groups = getPivotGroupValues(results);
        expect(groups).toContain(OTHER_GROUP_SENTINEL_VALUE);
        expect(groups).not.toContain(OTHER_GROUP_DISPLAY_VALUE);

        const otherColumns = results.pivotDetails!.valuesColumns.filter(
            (col) => col.pivotValues[0]?.value === OTHER_GROUP_SENTINEL_VALUE,
        );
        expect(otherColumns.length).toBeGreaterThan(0);
    });
});
