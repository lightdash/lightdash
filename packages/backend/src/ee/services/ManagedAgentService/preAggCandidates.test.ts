import {
    DimensionType,
    FieldType,
    MetricType,
    SupportedDbtAdapter,
    TimeFrames,
    type CompiledDimension,
    type CompiledMetric,
    type CompiledTable,
    type Explore,
} from '@lightdash/common';
import { buildPreAggCandidateSuggestion } from './preAggCandidates';

const makeDimension = (
    overrides: Partial<CompiledDimension> & Pick<CompiledDimension, 'name'>,
): CompiledDimension => ({
    ...overrides,
    fieldType: FieldType.DIMENSION,
    type: overrides.type ?? DimensionType.STRING,
    name: overrides.name,
    label: overrides.label ?? overrides.name,
    table: overrides.table ?? 'orders',
    tableLabel: overrides.tableLabel ?? 'Orders',
    sql: overrides.sql ?? `\${TABLE}.${overrides.name}`,
    compiledSql: overrides.compiledSql ?? `"orders".${overrides.name}`,
    tablesReferences: overrides.tablesReferences ?? [
        overrides.table ?? 'orders',
    ],
    hidden: overrides.hidden ?? false,
});

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
    sql: overrides.sql ?? `sum(\${TABLE}.amount)`,
    compiledSql: overrides.compiledSql ?? 'SUM("orders".amount)',
    tablesReferences: overrides.tablesReferences ?? [
        overrides.table ?? 'orders',
    ],
    hidden: overrides.hidden ?? false,
});

const makeTable = (
    name: string,
    dimensions: CompiledDimension[],
    metrics: CompiledMetric[],
): CompiledTable => ({
    name,
    label: name,
    database: 'db',
    schema: 'public',
    sqlTable: `"public"."${name}"`,
    dimensions: Object.fromEntries(dimensions.map((d) => [d.name, d])),
    metrics: Object.fromEntries(metrics.map((m) => [m.name, m])),
    lineageGraph: {},
});

const status = makeDimension({ name: 'status' });
const orderDateBase = makeDimension({
    name: 'order_date',
    type: DimensionType.DATE,
    isIntervalBase: true,
});
const orderDateDay = makeDimension({
    name: 'order_date_day',
    type: DimensionType.DATE,
    timeInterval: TimeFrames.DAY,
    timeIntervalBaseDimensionName: 'order_date',
});
const orderDateMonth = makeDimension({
    name: 'order_date_month',
    type: DimensionType.DATE,
    timeInterval: TimeFrames.MONTH,
    timeIntervalBaseDimensionName: 'order_date',
});
const customerName = makeDimension({
    name: 'first_name',
    table: 'customers',
    tableLabel: 'Customers',
    compiledSql: '"customers".first_name',
    tablesReferences: ['customers'],
});
const totalAmount = makeMetric({
    name: 'total_order_amount',
    type: MetricType.SUM,
});
const medianAmount = makeMetric({
    name: 'median_order_amount',
    type: MetricType.MEDIAN,
    sql: 'median(${TABLE}.amount)',
    compiledSql: 'MEDIAN("orders".amount)',
});

const explore: Explore = {
    name: 'orders',
    label: 'Orders',
    tags: [],
    baseTable: 'orders',
    joinedTables: [],
    tables: {
        orders: makeTable(
            'orders',
            [status, orderDateBase, orderDateDay, orderDateMonth],
            [totalAmount, medianAmount],
        ),
        customers: makeTable('customers', [customerName], []),
    },
    targetDatabase: SupportedDbtAdapter.POSTGRES,
};

describe('buildPreAggCandidateSuggestion', () => {
    it('proposes a validated definition covering the observed shapes', () => {
        const suggestion = buildPreAggCandidateSuggestion({
            explore,
            shapes: [
                {
                    dimensionFieldIds: [
                        'orders_status',
                        'orders_order_date_day',
                    ],
                    metricFieldIds: ['orders_total_order_amount'],
                    filterFieldIds: ['customers_first_name'],
                    hasCustomFields: false,
                    queryCount: 40,
                },
                {
                    dimensionFieldIds: ['orders_order_date_month'],
                    metricFieldIds: ['orders_total_order_amount'],
                    filterFieldIds: [],
                    hasCustomFields: false,
                    queryCount: 10,
                },
            ],
        });

        expect(suggestion.noSuggestionReason).toBeNull();
        expect(suggestion.timeDimension).toBe('order_date');
        expect(suggestion.granularity).toBe('day');
        expect(suggestion.suggestedYaml).toBe(
            [
                'pre_aggregates:',
                '  - name: orders_autopilot_candidate',
                '    dimensions:',
                '      - customers.first_name',
                '      - status',
                '    metrics:',
                '      - total_order_amount',
                '    time_dimension: order_date',
                '    granularity: day',
            ].join('\n'),
        );
        expect(suggestion.coveredQueryCount).toBe(50);
        expect(suggestion.coverableQueryCount).toBe(50);
        expect(suggestion.ineligibleFields).toEqual([]);
    });

    it('reports non-additive metrics as ineligible instead of proposing them', () => {
        const suggestion = buildPreAggCandidateSuggestion({
            explore,
            shapes: [
                {
                    dimensionFieldIds: ['orders_status'],
                    metricFieldIds: [
                        'orders_total_order_amount',
                        'orders_median_order_amount',
                    ],
                    filterFieldIds: [],
                    hasCustomFields: false,
                    queryCount: 20,
                },
            ],
        });

        expect(suggestion.suggestedYaml).toContain('total_order_amount');
        expect(suggestion.suggestedYaml).not.toContain('median_order_amount');
        expect(suggestion.ineligibleFields).toEqual([
            {
                fieldId: 'orders_median_order_amount',
                kind: 'metric',
                reason: 'non_additive_metric_type_median',
            },
        ]);
        expect(suggestion.coveredQueryCount).toBe(0);
    });

    it('returns no suggestion when every shape uses custom fields', () => {
        const suggestion = buildPreAggCandidateSuggestion({
            explore,
            shapes: [
                {
                    dimensionFieldIds: ['orders_status'],
                    metricFieldIds: ['orders_total_order_amount'],
                    filterFieldIds: [],
                    hasCustomFields: true,
                    queryCount: 15,
                },
            ],
        });

        expect(suggestion.suggestedYaml).toBeNull();
        expect(suggestion.noSuggestionReason).toBe(
            'every_observed_query_uses_custom_fields_that_cannot_hit_a_pre_aggregate',
        );
        expect(suggestion.customFieldQueryCount).toBe(15);
    });

    it('surfaces unknown field ids instead of failing', () => {
        const suggestion = buildPreAggCandidateSuggestion({
            explore,
            shapes: [
                {
                    dimensionFieldIds: [
                        'orders_status',
                        'orders_deleted_dimension',
                    ],
                    metricFieldIds: ['orders_total_order_amount'],
                    filterFieldIds: [],
                    hasCustomFields: false,
                    queryCount: 5,
                },
            ],
        });

        expect(suggestion.unresolvedFieldIds).toContain(
            'orders_deleted_dimension',
        );
        expect(suggestion.suggestedYaml).not.toBeNull();
        expect(suggestion.coveredQueryCount).toBe(0);
    });
});
