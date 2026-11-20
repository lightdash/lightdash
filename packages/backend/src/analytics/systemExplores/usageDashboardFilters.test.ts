import { FilterOperator, UnitOfTime } from '@lightdash/common';
import { createAnalyticsExplores } from '../../services/ProjectService/analyticsProject/createAnalyticsExplores';
import { analyticsContentAsCode } from './sampleContent';

const explores = createAnalyticsExplores();
const bundleOf = (slug: string) =>
    analyticsContentAsCode.find(({ dashboard }) => dashboard.slug === slug)!;
const filterOf = (slug: string, label: string) =>
    bundleOf(slug).dashboard.filters?.dimensions?.find(
        (filter) => filter.label === label,
    );
const settingsDashboards = [
    'lightdash-analytics-overview',
    'lightdash-analytics-query-activity',
    'lightdash-analytics-people',
    'lightdash-analytics-content',
    'lightdash-analytics-apps',
    'lightdash-analytics-tools',
    'lightdash-analytics-embed',
];

describe('usage dashboard filters', () => {
    it.each(settingsDashboards)(
        'gives %s a date range and a project filter',
        (slug) => {
            expect(filterOf(slug, 'Date')).toMatchObject({
                operator: FilterOperator.IN_THE_PAST,
                values: [30],
                settings: { unitOfTime: UnitOfTime.days, completed: true },
            });
            expect(filterOf(slug, 'Project')).toMatchObject({
                operator: FilterOperator.EQUALS,
                values: [],
                disabled: true,
            });
        },
    );

    it.each(settingsDashboards)(
        'points every chart of %s at a field of its own table, or leaves it out',
        (slug) => {
            const { dashboard, charts } = bundleOf(slug);
            for (const label of ['Date', 'Project']) {
                const targets = filterOf(slug, label)!.tileTargets!;
                expect(Object.keys(targets).sort()).toEqual(
                    charts.map((chart) => chart.slug).sort(),
                );
                for (const chart of charts) {
                    const target = targets[chart.slug];
                    if (target !== false) {
                        const explore = explores.find(
                            ({ name }) =>
                                name === chart.metricQuery.exploreName,
                        )!;
                        expect(target.tableName).toBe(explore.baseTable);
                        expect(
                            Object.keys(
                                explore.tables[explore.baseTable].dimensions,
                            ).map((name) => `${explore.baseTable}_${name}`),
                        ).toContain(target.fieldId);
                    }
                }
            }
            expect(dashboard.filters?.metrics).toEqual([]);
        },
    );

    it('leaves the date range off charts that set their own period or describe the present', () => {
        const queries = filterOf(
            'lightdash-analytics-query-activity',
            'Date',
        )!.tileTargets!;
        expect(
            Object.entries(queries)
                .filter(([, target]) => target === false)
                .map(([slug]) => slug),
        ).toEqual([
            'lightdash-analytics-query-activity-querying-users-month-over-month',
            'lightdash-analytics-query-activity-queries-run-month-over-month',
        ]);
        const content = filterOf(
            'lightdash-analytics-content',
            'Date',
        )!.tileTargets!;
        for (const chart of bundleOf('lightdash-analytics-content').charts) {
            expect(content[chart.slug] === false).toBe(
                ['content_health', 'content_inventory'].includes(
                    chart.metricQuery.exploreName,
                ),
            );
        }
    });

    it('keeps the filters Adoption sets by hand', () => {
        expect(
            bundleOf(
                'lightdash-analytics-adoption',
            ).dashboard.filters?.dimensions?.map(({ label }) => label),
        ).toEqual(['Date', 'Data app', 'Surface']);
    });
});
