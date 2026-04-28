import type { CompiledTable } from '../../types/explore';
import { FieldType, MetricType, type CompiledMetric } from '../../types/field';
import { getItemId } from '../../utils/item';
import {
    analyzePreAggregateNumberMetricDependencies,
    PreAggregateNumberMetricDependencyIneligibilityReason,
} from './numberMetricDependencies';

const makeMetric = (
    overrides: Partial<CompiledMetric> & Pick<CompiledMetric, 'name' | 'type'>,
): CompiledMetric => ({
    ...overrides,
    fieldType: FieldType.METRIC,
    type: overrides.type,
    name: overrides.name,
    label: overrides.label ?? overrides.name,
    table: overrides.table ?? 'orders',
    tableLabel: overrides.tableLabel ?? 'Orders',
    sql: overrides.sql ?? 'count(*)',
    compiledSql: overrides.compiledSql ?? overrides.sql ?? 'count(*)',
    tablesReferences: overrides.tablesReferences ?? ['orders'],
    hidden: overrides.hidden ?? false,
});

const makeTables = (
    metrics: CompiledMetric[],
): Record<
    string,
    Pick<CompiledTable, 'name' | 'originalName' | 'dimensions' | 'metrics'>
> =>
    metrics.reduce<
        Record<
            string,
            Pick<
                CompiledTable,
                'name' | 'originalName' | 'dimensions' | 'metrics'
            >
        >
    >((acc, metric) => {
        acc[metric.table] = acc[metric.table] ?? {
            name: metric.table,
            dimensions: {},
            metrics: {},
        };

        acc[metric.table].metrics[metric.name] = metric;
        return acc;
    }, {});

describe('analyzePreAggregateNumberMetricDependencies', () => {
    it('collects direct, transitive, and leaf metric dependencies', () => {
        const revenue = makeMetric({
            name: 'revenue',
            type: MetricType.SUM,
            sql: '${TABLE}.amount',
        });
        const cogs = makeMetric({
            name: 'cogs',
            type: MetricType.SUM,
            sql: '${TABLE}.cost',
        });
        const grossProfit = makeMetric({
            name: 'gross_profit',
            type: MetricType.NUMBER,
            sql: '${revenue} - ${cogs}',
        });
        const margin = makeMetric({
            name: 'margin',
            type: MetricType.NUMBER,
            sql: '${gross_profit} / NULLIF(${revenue}, 0)',
        });

        expect(
            analyzePreAggregateNumberMetricDependencies({
                metric: margin,
                tables: makeTables([revenue, cogs, grossProfit, margin]),
            }),
        ).toEqual({
            isValid: true,
            directReferencedMetricFieldIds: [
                getItemId(grossProfit),
                getItemId(revenue),
            ],
            transitiveReferencedMetricFieldIds: [
                getItemId(grossProfit),
                getItemId(revenue),
                getItemId(cogs),
            ],
            leafMetricFieldIds: [getItemId(revenue), getItemId(cogs)],
        });
    });

    it('rejects number metrics that aggregate over metric references', () => {
        const maxValue = makeMetric({
            name: 'max_value',
            type: MetricType.MAX,
            sql: '${TABLE}.value',
        });
        const sumOfMaxValue = makeMetric({
            name: 'sum_of_max_value',
            type: MetricType.NUMBER,
            sql: 'sum(${max_value})',
        });

        expect(
            analyzePreAggregateNumberMetricDependencies({
                metric: sumOfMaxValue,
                tables: makeTables([maxValue, sumOfMaxValue]),
            }),
        ).toEqual(
            expect.objectContaining({
                isValid: false,
                reason: PreAggregateNumberMetricDependencyIneligibilityReason.NESTED_AGGREGATE_METRIC_REFERENCE,
            }),
        );
    });

    it('rejects number metrics whose leaf dependencies are not materializable', () => {
        const distinctCustomerCount = makeMetric({
            name: 'distinct_customer_count',
            type: MetricType.COUNT_DISTINCT,
            sql: '${TABLE}.customer_id',
        });
        const customerDelta = makeMetric({
            name: 'customer_delta',
            type: MetricType.NUMBER,
            sql: '${distinct_customer_count} - 1',
        });

        expect(
            analyzePreAggregateNumberMetricDependencies({
                metric: customerDelta,
                tables: makeTables([distinctCustomerCount, customerDelta]),
            }),
        ).toEqual(
            expect.objectContaining({
                isValid: false,
                reason: PreAggregateNumberMetricDependencyIneligibilityReason.UNSUPPORTED_LEAF_METRIC_TYPE,
                ineligibleMetricFieldId: getItemId(distinctCustomerCount),
            }),
        );
    });
});
