/* eslint-disable no-await-in-loop -- One native DuckDB connection. */
import { DuckDBInstance } from '@duckdb/node-api';
import {
    WarehouseTypes,
    type ChartAsCode,
    type Filters,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { compileMetricQuery } from '../../queryCompiler';
import { createAnalyticsExplores } from '../../services/ProjectService/analyticsProject/createAnalyticsExplores';
import { MetricQueryBuilder } from '../../utils/QueryBuilder/MetricQueryBuilder';
import { queryEventsCompactedColumns } from '../eventStream/queryEventsStream';
import { analyticsContentAsCode } from './sampleContent';

const bundle = analyticsContentAsCode.find(
    ({ dashboard }) => dashboard.slug === 'lightdash-analytics-query-activity',
)!;
const charts = bundle.charts.filter(({ slug }) =>
    slug.endsWith('-month-over-month'),
);

const compile = (chart: ChartAsCode) => {
    const explore = createAnalyticsExplores().find(
        ({ name }) => name === 'query_events',
    )!;
    const warehouseSqlBuilder = warehouseSqlBuilderFromType(
        WarehouseTypes.DUCKDB,
    );
    return new MetricQueryBuilder({
        explore,
        compiledMetricQuery: compileMetricQuery({
            explore,
            metricQuery: {
                ...chart.metricQuery,
                filters: chart.metricQuery.filters as Filters,
            },
            warehouseSqlBuilder,
            availableParameters: [],
        }),
        warehouseSqlBuilder,
        intrinsicUserAttributes: {},
        parameterDefinitions: {},
        timezone: chart.metricQuery.timezone ?? 'UTC',
    }).compileQuery().query;
};

describe('monthly query comparisons', () => {
    afterEach(() => vi.useRealTimers());

    it('includes both metrics on the Queries dashboard', () => {
        expect(charts).toHaveLength(2);
        expect(charts.map(({ metricQuery }) => metricQuery.metrics[0])).toEqual(
            ['query_events_unique_users', 'query_events_total_queries'],
        );
        expect(bundle.dashboard.tabs).toContainEqual(
            expect.objectContaining({ slug: 'monthly-comparison' }),
        );
        for (const chart of charts) {
            expect(chart.metricQuery.timezone).toBe('UTC');
            expect(bundle.dashboard.tiles).toContainEqual(
                expect.objectContaining({
                    tabSlug: 'monthly-comparison',
                    properties: { chartSlug: chart.slug },
                }),
            );
        }
    });

    it('compiles and executes completed-month comparisons, distinct users, gaps and zero baselines', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-04-15T12:00:00Z'));
        const instance = await DuckDBInstance.create(':memory:', {
            threads: '1',
            memory_limit: '128MB',
        });
        const db = await instance.connect();
        try {
            await db.run(
                `CREATE TABLE query_events (${queryEventsCompactedColumns.map(({ name, type }) => `"${name}" ${type}`).join(', ')})`,
            );
            for (const chart of charts) {
                expect(
                    (await db.runAndReadAll(compile(chart))).getRowObjects(),
                ).toEqual([]);
            }
            await db.run(`INSERT INTO query_events (query_id, user_id, event_ts, status, cache_hit) VALUES
                ('too-old', 'a', '2025-03-31 23:59:59', 'success', false),
                ('first', 'a', '2025-04-01', 'success', false),
                ('unknown', NULL, '2025-11-03', 'success', false),
                ('dec-a', 'a', '2025-12-01', 'success', false),
                ('dec-b', 'b', '2025-12-31 23:59:59', 'success', false),
                ('jan-a', 'a', '2026-01-01', 'success', true),
                ('jan-a-again', 'a', '2026-01-15', 'error', false),
                ('jan-a-last', 'a', '2026-01-31', 'success', false),
                ('after-gap', 'c', '2026-03-31 23:59:59', 'success', false),
                ('partial-month', 'd', '2026-04-01', 'success', false)`);
            const users = (
                await db.runAndReadAll(compile(charts[0]))
            ).getRowObjectsJS();
            const queries = (
                await db.runAndReadAll(compile(charts[1]))
            ).getRowObjectsJS();
            // March, January, December, November, April: newest first; February is absent.
            expect(
                users.map((row) => Number(row.query_events_unique_users)),
            ).toEqual([1, 1, 2, 0, 1]);
            expect(
                users.map((row) =>
                    row.monthly_change === null
                        ? null
                        : Number(row.monthly_change),
                ),
            ).toEqual([null, -1, 2, null, null]);
            expect(users.map((row) => row.monthly_change_percent)).toEqual([
                null,
                -0.5,
                null,
                null,
                null,
            ]);
            expect(
                queries.map((row) => Number(row.query_events_total_queries)),
            ).toEqual([1, 3, 2, 1, 1]);
            expect(
                queries.map((row) =>
                    row.monthly_change === null
                        ? null
                        : Number(row.monthly_change),
                ),
            ).toEqual([null, 1, 1, null, null]);
            expect(queries.map((row) => row.monthly_change_percent)).toEqual([
                null,
                0.5,
                1,
                null,
                null,
            ]);
        } finally {
            db.closeSync();
            instance.closeSync();
        }
    });
});
