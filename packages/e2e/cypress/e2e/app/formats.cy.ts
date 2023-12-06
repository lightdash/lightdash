import { SEED_PROJECT } from '@lightdash/common';

describe('Explore', () => {
    beforeEach(() => {
        cy.login();
    });

    it('Should query in explore with formats and rounds', () => {
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
                sorts: [{ fieldId: 'events_in_eur', descending: true }],
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
        cy.visit(
            `/projects/${SEED_PROJECT.project_uuid}/tables/events${exploreUrlParams}`,
        );

        const headers = [
            'In eur',
            'In eur with round 0',
            'In eur with round 2',
            'In gbp',
            'In km',
            'In mi',
            'In percent',
        ];
        headers.forEach((field, i) => {
            cy.get(`thead > tr > :nth-child(${i + 2})`).contains(field);
        });
        const body = [
            '€1,999,000',
            '€1,999,000',
            '€1,999,000.00',
            '£1,999,000',
            '1,999,000 km',
            '1,999,000 mi',
            '199900000%',
        ];
        body.forEach((field, i) => {
            cy.get(`tbody > tr > :nth-child(${i + 2})`).contains(field);
        });
    });
});
