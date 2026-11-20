import { FilterOperator, ProjectType } from '@lightdash/common';
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
                excludePreviewContent: true,
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
            expect(JSON.stringify(query.filters)).not.toContain('project_type');
            expect(query.limit).toBeLessThanOrEqual(90);
            expect(query.additionalMetrics).toBeUndefined();
            expect(query.customDimensions).toBeUndefined();
        });
    });

    it('names each tab after the dashboard it shows, with Overview first', () => {
        expect(
            analyticsTabs.map(({ label, dashboardSlug }) => [
                label,
                dashboardSlug,
            ]),
        ).toEqual([
            ['Overview', 'lightdash-analytics-home'],
            ['Agents & AI', 'lightdash-analytics-overview'],
            ['Queries', 'lightdash-analytics-query-activity'],
            ['People', 'lightdash-analytics-people'],
            ['Content', 'lightdash-analytics-content'],
            ['Data apps', 'lightdash-analytics-apps'],
            ['Tools & operations', 'lightdash-analytics-tools'],
            ['Adoption', 'lightdash-analytics-adoption'],
            ['AI token usage', 'lightdash-analytics-ai-tokens'],
            ['Embed', 'lightdash-analytics-embed'],
        ]);
    });

    it('uses the agreed words in every title, label and description', () => {
        const copy = [
            ...analyticsHeadlineMetrics.flatMap(({ title, description }) => [
                title,
                description,
            ]),
            ...analyticsTabs.flatMap((tab) => [
                tab.label,
                tab.description,
                ...tab.charts.flatMap((chart) => [
                    chart.title,
                    ...chart.series.map(({ label }) => label),
                ]),
                ...(tab.summary?.metrics.map(({ title }) => title) ?? []),
            ]),
        ].join(' | ');
        expect(copy).not.toMatch(
            /\b(users?|observed|captured|retained|coverage|logical|Ask AI|AI agent|agent questions)\b|—/i,
        );
    });

    it('counts saved charts, SQL charts and dashboards with the inventory table alias', () => {
        const metric = analyticsHeadlineMetrics.find(
            ({ tab }) => tab === 'content',
        )!;
        const query = buildAnalyticsQuery(metric.query, {
            start: '2026-11-06',
            end: '2026-11-13',
            projectUuid: null,
            excludePreviewContent: true,
        });
        expect(query.exploreName).toBe('content_inventory');
        expect(query.filters.dimensions).toEqual(
            expect.objectContaining({
                and: expect.arrayContaining([
                    expect.objectContaining({
                        target: { fieldId: 'content_health_project_type' },
                        operator: FilterOperator.NOT_EQUALS,
                        values: [ProjectType.PREVIEW],
                    }),
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
