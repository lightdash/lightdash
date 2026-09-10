import { MetricType } from '@lightdash/common';
import { createAnalyticsExplores } from './createAnalyticsExplores';

describe('createAnalyticsExplores', () => {
    it('compiles curated metrics and time dimensions against internal views', () => {
        const [queries, ai] = createAnalyticsExplores();
        expect([queries.name, ai.name]).toEqual(['query_events', 'ai_usage']);
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
