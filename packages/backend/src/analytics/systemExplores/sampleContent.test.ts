import { createAnalyticsExplores } from '../../services/ProjectService/analyticsProject/createAnalyticsExplores';
import { analyticsSampleContent } from './sampleContent';

describe('analytics sample content', () => {
    it('uses unique stable keys and fields available in the system explores', () => {
        const explores = createAnalyticsExplores();
        const keys = analyticsSampleContent.charts.map(({ key }) => key);
        expect(new Set(keys).size).toBe(keys.length);
        for (const chart of analyticsSampleContent.charts) {
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
});
