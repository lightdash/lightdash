import {
    DimensionType,
    ExploreType,
    FieldType,
    InlineErrorType,
    isExploreError,
    MetricType,
    SupportedDbtAdapter,
    TimeFrames,
    type CompiledDimension,
    type CompiledMetric,
    type Explore,
    type ExploreError,
} from '@lightdash/common';
import { enhanceExploresForPreAggregates } from './enhanceExploresForPreAggregates';

const makeDimension = ({
    name,
    table,
    type = DimensionType.STRING,
}: {
    name: string;
    table: string;
    type?: DimensionType;
}): CompiledDimension => ({
    index: 0,
    fieldType: FieldType.DIMENSION,
    type,
    name,
    label: name,
    table,
    tableLabel: table,
    sql: `${table}.${name}`,
    hidden: false,
    compiledSql: `${table}.${name}`,
    tablesReferences: [table],
});

const makeMetric = ({
    name,
    table,
    type,
}: {
    name: string;
    table: string;
    type: MetricType;
}): CompiledMetric => ({
    index: 0,
    fieldType: FieldType.METRIC,
    type,
    name,
    label: name,
    table,
    tableLabel: table,
    sql: `${table}.${name}`,
    hidden: false,
    compiledSql: `${table}.${name}`,
    tablesReferences: [table],
});

/** Source explore with a count_distinct metric (unsupported in pre-aggregates) */
const exploreWithUnsupportedMetric = (): Explore => ({
    name: 'orders',
    label: 'Orders',
    tags: [],
    baseTable: 'orders',
    joinedTables: [],
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    tables: {
        orders: {
            name: 'orders',
            label: 'Orders',
            database: 'db',
            schema: 'public',
            sqlTable: 'orders',
            dimensions: {
                region: makeDimension({ name: 'region', table: 'orders' }),
            },
            metrics: {
                // count_distinct is unsupported in pre-aggregates
                unique_customers: makeMetric({
                    name: 'unique_customers',
                    table: 'orders',
                    type: MetricType.COUNT_DISTINCT,
                }),
                // sum is supported
                total_revenue: makeMetric({
                    name: 'total_revenue',
                    table: 'orders',
                    type: MetricType.SUM,
                }),
            },
            lineageGraph: {},
        },
    },
    preAggregates: [
        {
            name: 'order_kpis',
            dimensions: ['region'],
            metrics: ['unique_customers', 'total_revenue'],
            timeDimension: undefined,
            granularity: TimeFrames.DAY,
        },
    ],
});

/** Source explore with only supported metrics */
const exploreWithSupportedMetrics = (): Explore => ({
    name: 'orders',
    label: 'Orders',
    tags: [],
    baseTable: 'orders',
    joinedTables: [],
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    tables: {
        orders: {
            name: 'orders',
            label: 'Orders',
            database: 'db',
            schema: 'public',
            sqlTable: 'orders',
            dimensions: {
                region: makeDimension({ name: 'region', table: 'orders' }),
            },
            metrics: {
                total_revenue: makeMetric({
                    name: 'total_revenue',
                    table: 'orders',
                    type: MetricType.SUM,
                }),
                order_count: makeMetric({
                    name: 'order_count',
                    table: 'orders',
                    type: MetricType.COUNT,
                }),
            },
            lineageGraph: {},
        },
    },
    preAggregates: [
        {
            name: 'order_summary',
            dimensions: ['region'],
            metrics: ['total_revenue', 'order_count'],
            timeDimension: undefined,
            granularity: TimeFrames.DAY,
        },
    ],
});

describe('enhanceExploresForPreAggregates', () => {
    describe('enabled=false', () => {
        it('surfaces warnings for unsupported metrics even when pre-aggregates are disabled', () => {
            // Bug repro: when enabled=false, the early return skips validation entirely,
            // so unsupported metric errors are never attached as warnings to the source explore.
            const result = enhanceExploresForPreAggregates({
                explores: [exploreWithUnsupportedMetric()],
                enabled: false,
            });

            // Only the source explore — no virtual pre-aggregate explores
            expect(result).toHaveLength(1);

            const [sourceExplore] = result;
            expect(isExploreError(sourceExplore)).toBe(false);

            if (!isExploreError(sourceExplore)) {
                // The explore should have a warning about the unsupported metric
                expect(sourceExplore.warnings).toBeDefined();
                expect(sourceExplore.warnings!.length).toBeGreaterThan(0);

                const warningMessages = sourceExplore.warnings!.map(
                    (w) => w.message,
                );
                const hasUnsupportedMetricWarning = warningMessages.some((m) =>
                    m.toLowerCase().includes('count_distinct'),
                );
                expect(hasUnsupportedMetricWarning).toBe(true);

                // All warnings should be FIELD_ERROR type
                sourceExplore.warnings!.forEach((w) => {
                    expect(w.type).toBe(InlineErrorType.FIELD_ERROR);
                });
            }
        });

        it('returns source explore unchanged when pre-aggregates have only supported metrics', () => {
            const result = enhanceExploresForPreAggregates({
                explores: [exploreWithSupportedMetrics()],
                enabled: false,
            });

            // Only the source explore — no virtual pre-aggregate explores
            expect(result).toHaveLength(1);

            const [sourceExplore] = result;
            expect(isExploreError(sourceExplore)).toBe(false);

            if (!isExploreError(sourceExplore)) {
                // No warnings when all metrics are supported
                const warnings = sourceExplore.warnings ?? [];
                expect(warnings).toHaveLength(0);
            }
        });

        it('does not generate virtual pre-aggregate explores', () => {
            const result = enhanceExploresForPreAggregates({
                explores: [exploreWithSupportedMetrics()],
                enabled: false,
            });

            // No virtual pre-aggregate explores should be generated
            const preAggregateExplores = result.filter(
                (e) =>
                    !isExploreError(e) && e.type === ExploreType.PRE_AGGREGATE,
            );
            expect(preAggregateExplores).toHaveLength(0);
        });
    });

    describe('enabled=true', () => {
        it('generates virtual pre-aggregate explores for valid pre-aggregates', () => {
            const result = enhanceExploresForPreAggregates({
                explores: [exploreWithSupportedMetrics()],
                enabled: true,
            });

            // Source explore + at least one virtual pre-aggregate explore
            expect(result.length).toBeGreaterThan(1);

            const preAggregateExplores = result.filter(
                (e) =>
                    !isExploreError(e) && e.type === ExploreType.PRE_AGGREGATE,
            );
            expect(preAggregateExplores.length).toBeGreaterThan(0);
        });

        it('attaches warnings to source explore for unsupported metrics and does not generate virtual explore', () => {
            const result = enhanceExploresForPreAggregates({
                explores: [exploreWithUnsupportedMetric()],
                enabled: true,
            });

            const sourceExplore = result.find(
                (e) => !isExploreError(e) && e.name === 'orders',
            );
            expect(sourceExplore).toBeDefined();

            if (sourceExplore && !isExploreError(sourceExplore)) {
                expect(sourceExplore.warnings).toBeDefined();
                expect(sourceExplore.warnings!.length).toBeGreaterThan(0);
            }
        });
    });

    describe('pass-through cases', () => {
        it('passes ExploreError through unchanged for both enabled values', () => {
            const exploreError: ExploreError = {
                name: 'broken_explore',
                label: 'Broken Explore',
                errors: [
                    {
                        type: InlineErrorType.METADATA_PARSE_ERROR,
                        message: 'Something went wrong',
                    },
                ],
            };

            const resultDisabled = enhanceExploresForPreAggregates({
                explores: [exploreError],
                enabled: false,
            });
            expect(resultDisabled).toHaveLength(1);
            expect(isExploreError(resultDisabled[0])).toBe(true);

            const resultEnabled = enhanceExploresForPreAggregates({
                explores: [exploreError],
                enabled: true,
            });
            expect(resultEnabled).toHaveLength(1);
            expect(isExploreError(resultEnabled[0])).toBe(true);
        });

        it('passes explores without preAggregates through unchanged', () => {
            const exploreNoPreAgg: Explore = {
                ...exploreWithSupportedMetrics(),
                preAggregates: undefined,
            };

            const result = enhanceExploresForPreAggregates({
                explores: [exploreNoPreAgg],
                enabled: false,
            });
            expect(result).toHaveLength(1);
            expect(result[0]).toEqual(exploreNoPreAgg);
        });
    });
});
