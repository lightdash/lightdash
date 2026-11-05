import {
    ParameterError,
    QueryExecutionContext,
    ResultsCacheStatsContextGroup,
    ResultsCacheStatsMissReason,
} from '@lightdash/common';
import {
    buildResultsCacheStats,
    getContextsInGroup,
    getResultsCacheContextGroup,
    parseResultsCacheStatsDays,
    type ResultsCacheContextStatsRow,
    type ResultsCacheRecommendationRow,
} from './resultsCacheStats';

const contextRow = (
    overrides: Partial<ResultsCacheContextStatsRow>,
): ResultsCacheContextStatsRow => ({
    context: QueryExecutionContext.DASHBOARD,
    runs: 10,
    hits: 6,
    warehouseTimeOnMissesMs: 4000,
    warehouseTimeSavedMs: 6000,
    ...overrides,
});

const recommendationRow = (
    overrides: Partial<ResultsCacheRecommendationRow>,
): ResultsCacheRecommendationRow => ({
    reason: ResultsCacheStatsMissReason.EXPIRED,
    chartKind: 'chart',
    target: 'chart-uuid',
    name: 'Revenue',
    slug: null,
    misses: 8,
    warehouseTimeMs: 120_000,
    ...overrides,
});

describe('getResultsCacheContextGroup', () => {
    test.each([
        [
            QueryExecutionContext.DASHBOARD,
            ResultsCacheStatsContextGroup.DASHBOARDS,
        ],
        [
            QueryExecutionContext.AUTOREFRESHED_DASHBOARD,
            ResultsCacheStatsContextGroup.DASHBOARDS,
        ],
        [
            QueryExecutionContext.CHART,
            ResultsCacheStatsContextGroup.CHARTS_AND_EXPLORE,
        ],
        [
            QueryExecutionContext.EXPLORE,
            ResultsCacheStatsContextGroup.CHARTS_AND_EXPLORE,
        ],
        [
            QueryExecutionContext.SCHEDULED_DELIVERY,
            ResultsCacheStatsContextGroup.SCHEDULED,
        ],
        [
            QueryExecutionContext.GSHEETS,
            ResultsCacheStatsContextGroup.SCHEDULED,
        ],
        [QueryExecutionContext.ALERT, ResultsCacheStatsContextGroup.SCHEDULED],
        [QueryExecutionContext.API, ResultsCacheStatsContextGroup.OTHER],
        [null, ResultsCacheStatsContextGroup.OTHER],
        ['legacyUnknownContext', ResultsCacheStatsContextGroup.OTHER],
    ])('%s → %s', (context, group) => {
        expect(getResultsCacheContextGroup(context)).toBe(group);
    });

    test('scheduled contexts list matches the grouping', () => {
        expect(
            getContextsInGroup(ResultsCacheStatsContextGroup.SCHEDULED).sort(),
        ).toEqual(
            [
                QueryExecutionContext.SCHEDULED_DELIVERY,
                QueryExecutionContext.SCHEDULED_CHART,
                QueryExecutionContext.SCHEDULED_DASHBOARD,
                QueryExecutionContext.SCHEDULED_GSHEETS_CHART,
                QueryExecutionContext.SCHEDULED_GSHEETS_DASHBOARD,
                QueryExecutionContext.SCHEDULED_GSHEETS_SQL_CHART,
                QueryExecutionContext.GSHEETS,
                QueryExecutionContext.ALERT,
            ].sort(),
        );
    });
});

describe('parseResultsCacheStatsDays', () => {
    test('defaults to 7', () => {
        expect(parseResultsCacheStatsDays(undefined)).toBe(7);
    });
    test.each([7, 30])('accepts %d', (days) => {
        expect(parseResultsCacheStatsDays(days)).toBe(days);
    });
    test.each([0, 14, 31])('rejects %d', (days) => {
        expect(() => parseResultsCacheStatsDays(days)).toThrow(ParameterError);
    });
});

describe('buildResultsCacheStats', () => {
    test('sums contexts into groups and the summary', () => {
        const stats = buildResultsCacheStats({
            days: 7,
            contextRows: [
                contextRow({ context: QueryExecutionContext.DASHBOARD }),
                contextRow({
                    context: QueryExecutionContext.AUTOREFRESHED_DASHBOARD,
                    runs: 10,
                    hits: 4,
                }),
                contextRow({
                    context: QueryExecutionContext.SCHEDULED_DELIVERY,
                    runs: 5,
                    hits: 0,
                    warehouseTimeSavedMs: 0,
                }),
            ],
            recommendationRows: [],
        });
        expect(stats.byContext).toEqual([
            {
                group: ResultsCacheStatsContextGroup.DASHBOARDS,
                runs: 20,
                hits: 10,
                misses: 10,
                hitRate: 0.5,
                warehouseTimeOnMissesMs: 8000,
                warehouseTimeSavedMs: 12000,
            },
            {
                group: ResultsCacheStatsContextGroup.SCHEDULED,
                runs: 5,
                hits: 0,
                misses: 5,
                hitRate: 0,
                warehouseTimeOnMissesMs: 4000,
                warehouseTimeSavedMs: 0,
            },
        ]);
        expect(stats.summary).toMatchObject({
            runs: 25,
            hits: 10,
            misses: 15,
            hitRate: 0.4,
            avoidableMisses: 0,
            avoidableWarehouseTimeMs: 0,
        });
    });

    test('hit rate is null with no runs', () => {
        const stats = buildResultsCacheStats({
            days: 30,
            contextRows: [],
            recommendationRows: [],
        });
        expect(stats.summary.hitRate).toBeNull();
        expect(stats.byContext).toEqual([]);
    });

    test('builds recommendations, reasons and avoidable totals from passing rows', () => {
        const stats = buildResultsCacheStats({
            days: 7,
            contextRows: [contextRow({})],
            recommendationRows: [
                recommendationRow({}),
                recommendationRow({
                    reason: ResultsCacheStatsMissReason.SCHEDULED_REFRESH,
                    chartKind: 'sqlChart',
                    target: 'sql-uuid',
                    name: 'Orders SQL',
                    slug: 'orders-sql',
                    misses: 6,
                    warehouseTimeMs: 90_000,
                }),
                recommendationRow({
                    reason: ResultsCacheStatsMissReason.EXPIRED,
                    chartKind: 'explore',
                    target: 'orders',
                    name: null,
                    misses: 5,
                    warehouseTimeMs: 61_000,
                }),
            ],
        });
        expect(stats.recommendations).toEqual([
            {
                reason: ResultsCacheStatsMissReason.EXPIRED,
                target: {
                    kind: 'chart',
                    chartUuid: 'chart-uuid',
                    name: 'Revenue',
                },
                misses: 8,
                warehouseTimeMs: 120_000,
            },
            {
                reason: ResultsCacheStatsMissReason.SCHEDULED_REFRESH,
                target: {
                    kind: 'sqlChart',
                    savedSqlUuid: 'sql-uuid',
                    slug: 'orders-sql',
                    name: 'Orders SQL',
                },
                misses: 6,
                warehouseTimeMs: 90_000,
            },
            {
                reason: ResultsCacheStatsMissReason.EXPIRED,
                target: {
                    kind: 'explore',
                    exploreName: 'orders',
                    name: 'orders',
                },
                misses: 5,
                warehouseTimeMs: 61_000,
            },
        ]);
        expect(stats.missReasons).toEqual([
            {
                reason: ResultsCacheStatsMissReason.EXPIRED,
                misses: 13,
                warehouseTimeMs: 181_000,
            },
            {
                reason: ResultsCacheStatsMissReason.SCHEDULED_REFRESH,
                misses: 6,
                warehouseTimeMs: 90_000,
            },
        ]);
        expect(stats.summary.avoidableMisses).toBe(19);
        expect(stats.summary.avoidableWarehouseTimeMs).toBe(271_000);
    });

    test('drops deleted charts and keeps at most 10 recommendations', () => {
        const rows = Array.from({ length: 12 }, (_, i) =>
            recommendationRow({
                target: `chart-${i}`,
                warehouseTimeMs: 200_000 - i,
            }),
        );
        const stats = buildResultsCacheStats({
            days: 7,
            contextRows: [],
            recommendationRows: [
                recommendationRow({ target: 'deleted', name: null }),
                ...rows,
            ],
        });
        expect(stats.recommendations).toHaveLength(10);
        expect(
            stats.recommendations.some(
                (r) =>
                    r.target.kind === 'chart' &&
                    r.target.chartUuid === 'deleted',
            ),
        ).toBe(false);
        expect(stats.summary.avoidableMisses).toBe(12 * 8);
    });
});
