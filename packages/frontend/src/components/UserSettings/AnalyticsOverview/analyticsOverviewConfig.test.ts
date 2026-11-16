import { FilterOperator } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    analyticsDateRange,
    analyticsHeadlineMetrics,
    analyticsTabs,
    buildAnalyticsQuery,
} from './analyticsOverviewConfig';

describe('Analytics settings query scopes', () => {
    it('uses complete UTC days across month boundaries', () => {
        expect(
            analyticsDateRange(7, new Date('2026-03-02T01:00:00+02:00')),
        ).toEqual({ start: '2026-02-22', end: '2026-03-01' });
    });

    it('applies the date and selected project to every chart and metric', () => {
        const specs = [
            ...analyticsHeadlineMetrics.map((metric) => metric.query),
            ...analyticsTabs.flatMap((tab) =>
                tab.charts.map((chart) => chart.query),
            ),
        ];
        specs.forEach((spec) => {
            const query = buildAnalyticsQuery(spec, {
                start: '2026-11-06',
                end: '2026-11-13',
                projectUuid: 'reported-project',
            });
            expect(query.filters.dimensions).toEqual(
                expect.objectContaining({
                    and: expect.arrayContaining([
                        expect.objectContaining({
                            id: 'start',
                            operator: FilterOperator.GREATER_THAN_OR_EQUAL,
                            values: ['2026-11-06'],
                        }),
                        expect.objectContaining({
                            id: 'end',
                            operator: FilterOperator.LESS_THAN,
                            values: ['2026-11-13'],
                        }),
                        expect.objectContaining({
                            id: 'project',
                            target: {
                                fieldId: expect.stringMatching(/_project_id$/),
                            },
                            values: ['reported-project'],
                        }),
                    ]),
                }),
            );
            expect(query.limit).toBeLessThanOrEqual(90);
            expect(query.additionalMetrics).toBeUndefined();
            expect(query.customDimensions).toBeUndefined();
        });
    });

    it('counts saved charts, SQL charts and dashboards with the inventory table alias', () => {
        const metric = analyticsHeadlineMetrics.find(
            ({ tab }) => tab === 'content',
        )!;
        const query = buildAnalyticsQuery(metric.query, {
            start: '2026-11-06',
            end: '2026-11-13',
            projectUuid: null,
        });
        expect(query.exploreName).toBe('content_inventory');
        expect(query.filters.dimensions).toEqual(
            expect.objectContaining({
                and: expect.arrayContaining([
                    expect.objectContaining({
                        target: { fieldId: 'content_health_content_type' },
                        values: ['saved_chart', 'sql_chart', 'dashboard'],
                    }),
                    expect.objectContaining({
                        id: 'start',
                        target: { fieldId: 'content_health_created_at_day' },
                    }),
                ]),
            }),
        );
        expect(JSON.stringify(query.filters)).not.toContain('project_id');
    });
});
