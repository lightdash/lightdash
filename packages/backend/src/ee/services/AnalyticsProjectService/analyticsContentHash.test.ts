import type { LibraryChartBinding } from '../../../analytics/systemExplores/libraryCharts';
import { analyticsContentAsCode } from '../../../analytics/systemExplores/sampleContent';
import { createAnalyticsExplores } from '../../../services/ProjectService/analyticsProject/createAnalyticsExplores';
import { getAnalyticsContentHash } from './analyticsContentHash';

describe('analytics content revision', () => {
    it('is stable across independent compilation and transport timestamps', () => {
        const hash = getAnalyticsContentHash(
            createAnalyticsExplores(),
            analyticsContentAsCode,
            new Map(),
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
                new Map(),
            ),
        ).toBe(hash);
    });

    it('detects SQL changes without changing field or content counts', () => {
        const explores = createAnalyticsExplores();
        const hash = getAnalyticsContentHash(
            explores,
            analyticsContentAsCode,
            new Map(),
        );
        const users = explores.find(({ name }) => name === 'user_activity')!;
        users.tables.lightdash_users.dimensions.name.sql =
            "COALESCE(${TABLE}.name, ${TABLE}.email, 'Unknown user')";
        expect(
            getAnalyticsContentHash(
                explores,
                analyticsContentAsCode,
                new Map(),
            ),
        ).not.toBe(hash);
    });

    it('detects a changed dashboard or chart with the same slugs', () => {
        const explores = createAnalyticsExplores();
        const hash = getAnalyticsContentHash(
            explores,
            analyticsContentAsCode,
            new Map(),
        );
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
            expect(
                getAnalyticsContentHash(explores, content, new Map()),
            ).not.toBe(hash);
        }
    });

    it('changes when a binding option changes', () => {
        const explores = createAnalyticsExplores();
        const bindingWith = (value: string) =>
            new Map<string, LibraryChartBinding>([
                [
                    'd-c',
                    {
                        slug: 'heatmap',
                        minVersion: '0.4.0',
                        fieldMapping: { x: 'a', y: 'b', value: 'm' },
                        optionValues: { colour: value },
                        query: null,
                    },
                ],
            ]);
        expect(
            getAnalyticsContentHash(
                explores,
                analyticsContentAsCode,
                bindingWith('red'),
            ),
        ).not.toBe(
            getAnalyticsContentHash(
                explores,
                analyticsContentAsCode,
                bindingWith('blue'),
            ),
        );
    });

    it('changes when only a binding query limit changes', () => {
        const explores = createAnalyticsExplores();
        const bindingWith = (limit: number) =>
            new Map<string, LibraryChartBinding>([
                [
                    'd-c',
                    {
                        slug: 'heatmap',
                        minVersion: '0.4.0',
                        fieldMapping: { x: 'a', y: 'b', value: 'm' },
                        optionValues: {},
                        query: {
                            dimensions: ['a', 'b'],
                            metrics: ['m'],
                            sorts: [],
                            limit,
                        },
                    },
                ],
            ]);
        expect(
            getAnalyticsContentHash(
                explores,
                analyticsContentAsCode,
                bindingWith(10),
            ),
        ).not.toBe(
            getAnalyticsContentHash(
                explores,
                analyticsContentAsCode,
                bindingWith(20),
            ),
        );
    });
});
