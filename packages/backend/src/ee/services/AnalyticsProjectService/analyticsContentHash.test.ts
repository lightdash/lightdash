import { analyticsContentAsCode } from '../../../analytics/systemExplores/sampleContent';
import { createAnalyticsExplores } from '../../../services/ProjectService/analyticsProject/createAnalyticsExplores';
import { getAnalyticsContentHash } from './analyticsContentHash';

describe('analytics content revision', () => {
    it('is stable across independent compilation and transport timestamps', () => {
        const hash = getAnalyticsContentHash(
            createAnalyticsExplores(),
            analyticsContentAsCode,
        );
        expect(
            getAnalyticsContentHash(
                createAnalyticsExplores(),
                analyticsContentAsCode.map(({ dashboard, charts }) => ({
                    dashboard: { ...dashboard, updatedAt: new Date() },
                    charts: charts.map((chart) => ({
                        ...chart,
                        updatedAt: new Date(),
                    })),
                })),
            ),
        ).toBe(hash);
    });

    it('detects SQL changes without changing field or content counts', () => {
        const explores = createAnalyticsExplores();
        const hash = getAnalyticsContentHash(explores, analyticsContentAsCode);
        const users = explores.find(({ name }) => name === 'user_activity')!;
        users.tables.lightdash_users.dimensions.name.sql =
            "COALESCE(${TABLE}.name, ${TABLE}.email, 'Unknown user')";
        expect(
            getAnalyticsContentHash(explores, analyticsContentAsCode),
        ).not.toBe(hash);
    });

    it('detects a changed dashboard or chart with the same slugs', () => {
        const explores = createAnalyticsExplores();
        const hash = getAnalyticsContentHash(explores, analyticsContentAsCode);
        for (const content of [
            analyticsContentAsCode.map((bundle, index) =>
                index === 0
                    ? {
                          ...bundle,
                          dashboard: { ...bundle.dashboard, name: 'New title' },
                      }
                    : bundle,
            ),
            analyticsContentAsCode.map((bundle, index) =>
                index === 0
                    ? {
                          ...bundle,
                          charts: bundle.charts.map((chart, chartIndex) =>
                              chartIndex === 0
                                  ? { ...chart, description: 'New definition' }
                                  : chart,
                          ),
                      }
                    : bundle,
            ),
        ]) {
            expect(getAnalyticsContentHash(explores, content)).not.toBe(hash);
        }
    });
});
