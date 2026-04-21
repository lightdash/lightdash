import { SEED_PROJECT } from '@lightdash/common';
import { expect, test } from '../../fixtures';

test.describe.skip('Explore', () => {
    // todo: move to unit test
    test.skip('Should query in explore with formats and rounds', async ({
        adminPage: page,
    }) => {
        const urlParam = {
            tableName: 'events',
            metricQuery: {
                exploreName: 'events',
                dimensions: [],
                metrics: [
                    'events_in_eur',
                    'events_in_eur_with_round_0',
                    'events_in_eur_with_round_2',
                    'events_in_gbp',
                    'events_in_jpy',
                    'events_in_dkk',
                    'events_in_km',
                    'events_in_mi',
                    'events_in_percent',
                ],
                filters: {
                    dimensions: {
                        id: '694f188d-c8a6-4989-b685-be374e87ff4d',
                        and: [
                            {
                                id: '85c7177d-4b81-4914-8073-18309ac497c8',
                                target: { fieldId: 'events_event_id' },
                                operator: 'lessThan',
                                values: [2000],
                            },
                        ],
                    },
                },
                sorts: [
                    {
                        fieldId: 'events_in_eur',
                        descending: true,
                    },
                ],
                limit: 1,
                tableCalculations: [],
                additionalMetrics: [],
            },
            tableConfig: {
                columnOrder: [
                    'events_in_eur',
                    'events_in_eur_with_round_0',
                    'events_in_eur_with_round_2',
                    'events_in_gbp',
                    'events_in_jpy',
                    'events_in_dkk',
                    'events_in_km',
                    'events_in_mi',
                    'events_in_percent',
                ],
            },
            chartConfig: {
                type: 'cartesian',
                config: {
                    layout: {
                        xField: 'events_in_eur',
                        yField: ['events_in_eur_with_round_0'],
                    },
                    eChartsConfig: {
                        series: [
                            {
                                encode: {
                                    xRef: { field: 'events_in_eur' },
                                    yRef: {
                                        field: 'events_in_eur_with_round_0',
                                    },
                                },
                                type: 'bar',
                            },
                        ],
                    },
                },
            },
        };
        const exploreUrlParams = `?create_saved_chart_version=${encodeURI(
            JSON.stringify(urlParam),
        )}`;
        await page.goto(
            `/projects/${SEED_PROJECT.project_uuid}/tables/events${exploreUrlParams}`,
        );

        // run query
        await page.getByRole('button', { name: 'Run query' }).first().click();

        const headers = [
            'In eur',
            'In eur with round 0',
            'In eur with round 2',
            'In gbp',
            'In jpy',
            'In dkk',
            'In km',
            'In mi',
            'In percent',
        ];
        for (let i = 0; i < headers.length; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            await expect(
                page.locator(`thead > tr > :nth-child(${i + 2})`),
            ).toContainText(headers[i]);
        }
        const body = [
            '\u20AC1,999,000',
            '\u20AC1,999,000',
            '\u20AC1,999,000.00',
            '\u00A31,999,000',
            '\u00A51,999,000',
            'DKK 1,999,000',
            '1,999,000 km',
            '1,999,000 mi',
            '199,900,000%',
        ];
        for (let i = 0; i < body.length; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            await expect(
                page.locator(`tbody > tr > :nth-child(${i + 2})`),
            ).toContainText(body[i]);
        }
    });
});
