import {
    CompiledMetricQuery,
    Explore,
    FilterOperator,
    getItemId,
    renderFilterRuleSqlFromField,
    UnitOfTime,
    type CompiledDimension,
    type CompiledMetric,
    type MetricFilterRule,
} from '@lightdash/common';
import { MetricQueryBuilder } from './MetricQueryBuilder';
import {
    EXPLORE_WITH_DATE_DIMENSION,
    QUERY_BUILDER_UTC_TIMEZONE,
    warehouseClientMock,
} from './MetricQueryBuilder.mock';

// PROD-8219: a metric YAML relative-date filter (inThePast/inTheNext/...) is
// baked into compiled SQL at explore compile time. The query builder must
// re-evaluate that boundary against "now" at query time so the window rolls
// forward without a recompile.

const COMPILE_TIME = new Date('2026-05-04T00:00:00Z').getTime();
const QUERY_TIME = new Date('2026-06-04T00:00:00Z').getTime();

const createdAt: CompiledDimension = EXPLORE_WITH_DATE_DIMENSION.tables.orders
    .dimensions.created_at as CompiledDimension;
const baseMetric = EXPLORE_WITH_DATE_DIMENSION.tables.orders.metrics
    .order_count as CompiledMetric;

const relativeRule = (
    id: string,
    operator: FilterOperator,
): MetricFilterRule => ({
    id,
    target: { fieldRef: 'created_at' },
    operator,
    values: [30],
    settings: { unitOfTime: UnitOfTime.days, completed: false },
});

// Render a predicate the way the explore compiler does (no timezone), at a given
// time, so it matches the substring baked into compiledSql.
const bakePredicateAt = (rule: MetricFilterRule, atMs: number): string => {
    jest.setSystemTime(atMs);
    return renderFilterRuleSqlFromField(
        { ...rule, target: { fieldId: getItemId(createdAt) } },
        createdAt,
        warehouseClientMock.getFieldQuoteChar(),
        warehouseClientMock.getStringQuoteChar(),
        warehouseClientMock.escapeString.bind(warehouseClientMock),
        warehouseClientMock.getStartOfWeek(),
        warehouseClientMock.getAdapterType(),
    );
};

const exploreWithMetric = (metric: CompiledMetric): Explore => ({
    ...EXPLORE_WITH_DATE_DIMENSION,
    tables: {
        ...EXPLORE_WITH_DATE_DIMENSION.tables,
        orders: {
            ...EXPLORE_WITH_DATE_DIMENSION.tables.orders,
            metrics: { order_count: metric },
        },
    },
});

const metricQuery: CompiledMetricQuery = {
    exploreName: 'orders',
    dimensions: ['orders_created_at'],
    metrics: ['orders_order_count'],
    filters: {},
    sorts: [],
    limit: 100,
    tableCalculations: [],
    compiledTableCalculations: [],
    compiledAdditionalMetrics: [],
    compiledCustomDimensions: [],
};

const runQueryAt = (explore: Explore, atMs: number): string => {
    jest.setSystemTime(atMs);
    return new MetricQueryBuilder({
        explore,
        compiledMetricQuery: metricQuery,
        warehouseSqlBuilder: warehouseClientMock,
        intrinsicUserAttributes: {},
        timezone: QUERY_BUILDER_UTC_TIMEZONE,
        parameterDefinitions: {},
    }).compileQuery().query;
};

describe('PROD-8219: relative-date metric filters evaluate at query time', () => {
    beforeAll(() => jest.useFakeTimers());
    afterAll(() => jest.useRealTimers());

    test('inThePast boundary is swapped for one anchored to query-time now', () => {
        const rule = relativeRule('rdf1', FilterOperator.IN_THE_PAST);
        const baked = bakePredicateAt(rule, COMPILE_TIME);
        expect(baked).toContain('2026-04-04'); // now-30d at compile
        expect(baked).toContain('2026-05-04'); // now at compile

        const explore = exploreWithMetric({
            ...baseMetric,
            filters: [rule],
            compiledSql: `COUNT(CASE WHEN (${baked}) THEN ("orders".created_at) ELSE NULL END)`,
            compiledRelativeDateFilters: [
                {
                    id: 'rdf1',
                    fieldId: getItemId(createdAt),
                    compiledSql: baked,
                },
            ],
        });

        const query = runQueryAt(explore, QUERY_TIME);
        expect(query).not.toContain('2026-04-04'); // stale lower bound gone
        expect(query).toContain('2026-05-05'); // now-30d at query time
        expect(query).toContain('2026-06-04'); // now at query time
    });

    test('inTheNext also rolls forward at query time', () => {
        const rule = relativeRule('rdf1', FilterOperator.IN_THE_NEXT);
        const baked = bakePredicateAt(rule, COMPILE_TIME);
        expect(baked).toContain('2026-06-03'); // now+30d at compile

        const explore = exploreWithMetric({
            ...baseMetric,
            filters: [rule],
            compiledSql: `COUNT(CASE WHEN (${baked}) THEN ("orders".created_at) ELSE NULL END)`,
            compiledRelativeDateFilters: [
                {
                    id: 'rdf1',
                    fieldId: getItemId(createdAt),
                    compiledSql: baked,
                },
            ],
        });

        const query = runQueryAt(explore, QUERY_TIME);
        expect(query).not.toContain('2026-06-03'); // stale upper bound gone
        expect(query).toContain('2026-07-04'); // now+30d at query time
    });

    test('only the relative predicate is swapped; static predicates stay intact', () => {
        const rule = relativeRule('rdf1', FilterOperator.IN_THE_PAST);
        const baked = bakePredicateAt(rule, COMPILE_TIME);
        const staticPredicate = '("orders".order_id) > (0)';

        const explore = exploreWithMetric({
            ...baseMetric,
            filters: [
                {
                    id: 'static',
                    target: { fieldRef: 'order_id' },
                    operator: FilterOperator.GREATER_THAN,
                    values: [0],
                },
                rule,
            ],
            compiledSql: `COUNT(CASE WHEN (${staticPredicate} AND ${baked}) THEN ("orders".order_id) ELSE NULL END)`,
            compiledRelativeDateFilters: [
                {
                    id: 'rdf1',
                    fieldId: getItemId(createdAt),
                    compiledSql: baked,
                },
            ],
        });

        const query = runQueryAt(explore, QUERY_TIME);
        expect(query).toContain(staticPredicate); // untouched
        expect(query).not.toContain('2026-04-04'); // relative rolled forward
        expect(query).toContain('2026-05-05');
    });

    test('a metric with no relative filters is unaffected (time-independent)', () => {
        const explore = exploreWithMetric(baseMetric); // plain COUNT, no filters
        expect(runQueryAt(explore, COMPILE_TIME)).toEqual(
            runQueryAt(explore, QUERY_TIME),
        );
    });

    test('multiple relative filters on one metric each roll forward independently', () => {
        const rule30 = relativeRule('r30', FilterOperator.IN_THE_PAST);
        const rule7: MetricFilterRule = {
            id: 'r7',
            target: { fieldRef: 'created_at' },
            operator: FilterOperator.IN_THE_PAST,
            values: [7],
            settings: { unitOfTime: UnitOfTime.days, completed: false },
        };
        const baked30 = bakePredicateAt(rule30, COMPILE_TIME);
        const baked7 = bakePredicateAt(rule7, COMPILE_TIME);

        const explore = exploreWithMetric({
            ...baseMetric,
            filters: [rule30, rule7],
            compiledSql: `COUNT(CASE WHEN (${baked30} AND ${baked7}) THEN ("orders".created_at) ELSE NULL END)`,
            compiledRelativeDateFilters: [
                {
                    id: 'r30',
                    fieldId: getItemId(createdAt),
                    compiledSql: baked30,
                },
                {
                    id: 'r7',
                    fieldId: getItemId(createdAt),
                    compiledSql: baked7,
                },
            ],
        });

        const query = runQueryAt(explore, QUERY_TIME);
        expect(query).not.toContain('2026-04-04'); // stale 30d lower
        expect(query).not.toContain('2026-04-27'); // stale 7d lower
        expect(query).toContain('2026-05-05'); // fresh 30d lower
        expect(query).toContain('2026-05-28'); // fresh 7d lower
    });

    test.each([
        [FilterOperator.NOT_IN_THE_PAST, '2026-04-04', '2026-05-05'],
        [FilterOperator.IN_THE_CURRENT, '2026-05-01', '2026-06-01'],
    ])(
        '%s boundary is re-evaluated at query time',
        (operator, staleFragment, freshFragment) => {
            const rule: MetricFilterRule = {
                id: 'rdf1',
                target: { fieldRef: 'created_at' },
                operator,
                values: [30],
                settings: {
                    unitOfTime:
                        operator === FilterOperator.IN_THE_CURRENT
                            ? UnitOfTime.months
                            : UnitOfTime.days,
                    completed: false,
                },
            };
            const baked = bakePredicateAt(rule, COMPILE_TIME);
            expect(baked).toContain(staleFragment);

            const explore = exploreWithMetric({
                ...baseMetric,
                filters: [rule],
                compiledSql: `COUNT(CASE WHEN (${baked}) THEN ("orders".created_at) ELSE NULL END)`,
                compiledRelativeDateFilters: [
                    {
                        id: 'rdf1',
                        fieldId: getItemId(createdAt),
                        compiledSql: baked,
                    },
                ],
            });

            const query = runQueryAt(explore, QUERY_TIME);
            expect(query).toContain(freshFragment);
        },
    );

    test('swap still matches and rolls forward under a non-UTC query timezone', () => {
        // Guards the security concern that a non-UTC offset could make the
        // anchor substring silently miss. (A DATE dimension's boundaries are
        // timezone-independent, so the fresh dates match the UTC case.)
        const rule = relativeRule('rdf1', FilterOperator.IN_THE_PAST);
        const baked = bakePredicateAt(rule, COMPILE_TIME);
        const explore = exploreWithMetric({
            ...baseMetric,
            filters: [rule],
            compiledSql: `COUNT(CASE WHEN (${baked}) THEN ("orders".created_at) ELSE NULL END)`,
            compiledRelativeDateFilters: [
                {
                    id: 'rdf1',
                    fieldId: getItemId(createdAt),
                    compiledSql: baked,
                },
            ],
        });

        jest.setSystemTime(QUERY_TIME);
        const nyQuery = new MetricQueryBuilder({
            explore,
            compiledMetricQuery: metricQuery,
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: {},
            timezone: 'America/New_York',
            parameterDefinitions: {},
        }).compileQuery().query;

        expect(nyQuery).not.toContain('2026-04-04'); // stale gone
        expect(nyQuery).toContain('2026-05-05'); // rolled forward to query time
    });

    test('old cached explore without compiledRelativeDateFilters is a safe no-op', () => {
        const rule = relativeRule('rdf1', FilterOperator.IN_THE_PAST);
        const baked = bakePredicateAt(rule, COMPILE_TIME);
        // Simulate a pre-fix cached explore: filters present, but no
        // compiledRelativeDateFilters recorded.
        const explore = exploreWithMetric({
            ...baseMetric,
            filters: [rule],
            compiledSql: `COUNT(CASE WHEN (${baked}) THEN ("orders".created_at) ELSE NULL END)`,
        });

        const query = runQueryAt(explore, QUERY_TIME);
        // No swap happens — the stale compile-time window remains (old behavior),
        // no crash. Takes effect only after a recompile.
        expect(query).toContain('2026-04-04');
        expect(query).not.toContain('2026-05-05');
    });
});
