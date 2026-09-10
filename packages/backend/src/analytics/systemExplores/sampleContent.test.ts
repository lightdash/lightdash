import { CartesianSeriesType, ChartType } from '@lightdash/common';
import { createAnalyticsExplores } from '../../services/ProjectService/analyticsProject/createAnalyticsExplores';
import { analyticsSampleContent } from './sampleContent';

describe('analytics sample content', () => {
    it('uses unique stable keys and fields available in the system explores', () => {
        const explores = createAnalyticsExplores();
        const keys = analyticsSampleContent.charts.map(({ key }) => key);
        expect(new Set(keys).size).toBe(keys.length);
        for (const chart of analyticsSampleContent.charts) {
            expect(chart.metricQuery.limit).toBeLessThanOrEqual(5000);
            const explore = explores.find(
                ({ name }) => name === chart.tableName,
            )!;
            expect(explore).toBeDefined();
            const table = explore.tables[chart.tableName];
            const fields = new Set(
                [
                    ...Object.keys(table.dimensions),
                    ...Object.keys(table.metrics),
                ].map((name) => `${chart.tableName}_${name}`),
            );
            for (const field of [
                ...chart.metricQuery.dimensions,
                ...chart.metricQuery.metrics,
            ]) {
                expect(fields).toContain(field);
            }
        }
    });

    it('renders daily trends as chronologically sorted lines', () => {
        for (const key of ['ai-calls-by-day', 'queries-by-day']) {
            const chart = analyticsSampleContent.charts.find(
                (item) => item.key === key,
            )!;
            expect(chart.chartConfig).toMatchObject({
                type: ChartType.CARTESIAN,
                config: {
                    eChartsConfig: {
                        series: [
                            { type: CartesianSeriesType.LINE, smooth: false },
                        ],
                    },
                },
            });
            expect(chart.metricQuery.sorts).toEqual([
                {
                    fieldId: `${chart.tableName}_event_ts_day`,
                    descending: false,
                },
            ]);
        }
    });
});
