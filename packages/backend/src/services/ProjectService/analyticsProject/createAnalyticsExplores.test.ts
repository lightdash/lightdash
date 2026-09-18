import { MetricType, WarehouseTypes } from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { MetricQueryBuilder } from '../../../utils/QueryBuilder/MetricQueryBuilder';
import { createAnalyticsExplores } from './createAnalyticsExplores';

describe('createAnalyticsExplores', () => {
    it.each([
        ['ai_usage', 'users', 'total_ai_calls'],
        ['query_events', 'charts', 'total_queries'],
        ['query_events', 'dashboards', 'total_queries'],
    ])(
        'compiles %s joined to %s without primary-key warnings',
        (name, dimension, metric) => {
            const explore = createAnalyticsExplores().find(
                (item) => item.name === name,
            )!;
            const { warnings } = new MetricQueryBuilder({
                explore,
                compiledMetricQuery: {
                    exploreName: name,
                    dimensions: [`lightdash_${dimension}_name`],
                    metrics: [`${name}_${metric}`],
                    filters: {},
                    sorts: [],
                    limit: 500,
                    tableCalculations: [],
                    compiledTableCalculations: [],
                    compiledAdditionalMetrics: [],
                    compiledCustomDimensions: [],
                },
                warehouseSqlBuilder: warehouseSqlBuilderFromType(
                    WarehouseTypes.DUCKDB,
                ),
                intrinsicUserAttributes: {},
                parameterDefinitions: {},
                timezone: 'UTC',
            }).compileQuery();
            expect(warnings).toEqual([]);
        },
    );

    it('compiles curated metrics and time dimensions against internal views', () => {
        const explores = createAnalyticsExplores();
        const [queries, ai, apps, exports] = explores;
        expect(exports.tables.export_events.metrics.total_events.type).toBe(
            MetricType.COUNT,
        );
        expect(exports.tables.export_events.dimensions.format).toBeDefined();
        expect(exports.tables.export_events.dimensions.query_id).toBeDefined();
        expect(exports.joinedTables).toEqual([
            expect.objectContaining({
                table: 'lightdash_users',
                relationship: 'many-to-one',
            }),
            expect.objectContaining({
                table: 'query_events',
                relationship: 'many-to-one',
            }),
        ]);
        expect(exports.tables.lightdash_users.dimensions.name).toBeDefined();
        expect(exports.tables.query_events.dimensions.chart_id).toBeDefined();
        expect(
            exports.tables.query_events.dimensions.dashboard_id,
        ).toBeDefined();
        expect(exports.tables.query_events.metrics).toEqual({});
        expect(explores.map(({ name }) => name)).toEqual([
            'query_events',
            'ai_usage',
            'data_app_events',
            'export_events',
        ]);
        expect(apps.tables.data_app_events.dimensions.app_id).toBeDefined();
        expect(apps.tables.data_app_events.dimensions.user_id).toBeDefined();
        expect(
            apps.tables.data_app_events.dimensions.event_ts_day,
        ).toBeDefined();
        expect(apps.tables.data_app_events.metrics.total_views.type).toBe(
            MetricType.COUNT,
        );
        expect(apps.tables.data_app_events.metrics.unique_viewers.type).toBe(
            MetricType.COUNT_DISTINCT,
        );
        expect(queries.tables.query_events.sqlTable).toBe('"query_events"');
        expect(queries.tables.query_events.metrics.total_queries.type).toBe(
            MetricType.COUNT,
        );
        expect(
            queries.tables.query_events.metrics.p90_warehouse_execution_time_ms
                .percentile,
        ).toBe(90);
        expect(
            queries.tables.query_events.dimensions.event_ts_day,
        ).toBeDefined();
        expect(ai.tables.ai_usage.metrics.total_input_tokens.type).toBe(
            MetricType.SUM,
        );
        expect(ai.tables.ai_usage.metrics.unique_users.type).toBe(
            MetricType.COUNT_DISTINCT,
        );
    });

    it('does not turn unexpected source columns into model fields or metrics', () => {
        const [queries] = createAnalyticsExplores();
        expect(
            queries.tables.query_events.dimensions.extra_numeric,
        ).toBeUndefined();
        expect(
            queries.tables.query_events.metrics.total_row_count_total,
        ).toBeUndefined();
    });
});
