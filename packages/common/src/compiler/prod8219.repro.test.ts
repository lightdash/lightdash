import { type Table } from '../types/explore';
import { DimensionType, FieldType, MetricType } from '../types/field';
import { FilterOperator, UnitOfTime } from '../types/filter';
import { ExploreCompiler } from './exploreCompiler';
import { warehouseClientMock } from './exploreCompiler.mock';

// PROD-8219 reproduction: a metric YAML `inThePast` filter bakes a static
// timestamp literal at compile time instead of evaluating at query time.

const compiler = new ExploreCompiler(warehouseClientMock);

const tableWithRelativeDateMetricFilter: Record<string, Table> = {
    table1: {
        name: 'table1',
        label: 'table1',
        database: 'database',
        schema: 'schema',
        sqlTable: '"db"."schema"."table1"',
        sqlWhere: undefined,
        dimensions: {
            last_bet_date: {
                type: DimensionType.TIMESTAMP,
                name: 'last_bet_date',
                label: 'last_bet_date',
                table: 'table1',
                tableLabel: 'table1',
                fieldType: FieldType.DIMENSION,
                sql: '${TABLE}.last_bet_date',
                hidden: false,
            },
        },
        metrics: {
            bettor_in_last_30_days: {
                type: MetricType.COUNT,
                fieldType: FieldType.METRIC,
                table: 'table1',
                tableLabel: 'table1',
                name: 'bettor_in_last_30_days',
                label: 'User has bet in the last 30 days',
                sql: '${TABLE}.last_bet_date',
                hidden: false,
                filters: [
                    {
                        id: 'f1',
                        target: { fieldRef: 'last_bet_date' },
                        operator: FilterOperator.IN_THE_PAST,
                        values: [30],
                        settings: {
                            unitOfTime: UnitOfTime.days,
                            completed: false,
                        },
                    },
                ],
            },
        },
        lineageGraph: {},
        groupLabel: undefined,
    },
};

const compileAt = (isoNow: string) => {
    jest.setSystemTime(new Date(isoNow).getTime());
    return compiler.compileMetric(
        tableWithRelativeDateMetricFilter.table1.metrics.bettor_in_last_30_days,
        tableWithRelativeDateMetricFilter,
        [],
    );
};

describe('PROD-8219: metric YAML inThePast is compile-time, not query-time', () => {
    beforeAll(() => jest.useFakeTimers());
    afterAll(() => jest.useRealTimers());

    test('the 30-day window is anchored to compile time and moves when you recompile', () => {
        const compiledInMay = compileAt('2026-05-04T04:12:11Z').compiledSql;
        const compiledInJune = compileAt('2026-06-04T04:12:11Z').compiledSql;

        // BUG: boundaries are static string literals baked into the SQL...
        expect(compiledInMay).toContain("'2026-04-04");
        expect(compiledInJune).toContain("'2026-05-05");

        // ...and there is NO runtime expression that would make it roll forward.
        expect(compiledInJune).not.toMatch(/current_timestamp|now\(\)/i);

        // ...so the exact same metric compiles to a DIFFERENT window depending
        // only on when compilation ran. That frozen string is what gets cached
        // in cached_explore and reused for every query until the next recompile.
        expect(compiledInMay).not.toEqual(compiledInJune);
    });

    test('the relative-date predicate is captured so the query builder can re-evaluate it at query time', () => {
        const compiled = compileAt('2026-06-04T04:12:11Z');

        // The compile-time predicate is stored verbatim, keyed by filter id, so
        // MetricQueryBuilder can locate it inside compiledSql and swap in a
        // freshly evaluated boundary (PROD-8219 fix).
        expect(compiled.compiledRelativeDateFilters).toHaveLength(1);
        const [stored] = compiled.compiledRelativeDateFilters!;
        expect(stored.id).toBe('f1');
        expect(compiled.compiledSql).toContain(stored.compiledSql);
        expect(stored.compiledSql).toContain("'2026-05-05");
    });
});
