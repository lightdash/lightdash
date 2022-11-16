import { SEED_PROJECT } from '@lightdash/common';

describe('Explore', () => {
    before(() => {
        cy.login();
    });

    beforeEach(() => {
        Cypress.Cookies.preserveOnce('connect.sid');
    });

    it('Should query in explore with formats and rounds', () => {
        const exploreUrlParams = `?create_saved_chart_version=%7B"tableName"%3A"events"%2C"metricQuery"%3A%7B"dimensions"%3A%5B%5D%2C"metrics"%3A%5B"events_in_eur"%2C"events_in_eur_with_round_0"%2C"events_in_eur_with_round_2"%2C"events_in_gbp"%2C"events_in_km"%2C"events_in_mi"%2C"events_in_percent"%5D%2C"filters"%3A%7B"dimensions"%3A%7B"id"%3A"694f188d-c8a6-4989-b685-be374e87ff4d"%2C"and"%3A%5B%7B"id"%3A"85c7177d-4b81-4914-8073-18309ac497c8"%2C"target"%3A%7B"fieldId"%3A"events_event_id"%7D%2C"operator"%3A"lessThan"%2C"values"%3A%5B2000%5D%7D%5D%7D%7D%2C"sorts"%3A%5B%7B"fieldId"%3A"events_in_eur"%2C"descending"%3Atrue%7D%5D%2C"limit"%3A1%2C"tableCalculations"%3A%5B%5D%2C"additionalMetrics"%3A%5B%5D%7D%2C"tableConfig"%3A%7B"columnOrder"%3A%5B"events_in_eur"%2C"events_in_eur_with_round_0"%2C"events_in_eur_with_round_2"%2C"events_in_gbp"%2C"events_in_km"%2C"events_in_mi"%2C"events_in_percent"%5D%7D%2C"chartConfig"%3A%7B"type"%3A"cartesian"%2C"config"%3A%7B"layout"%3A%7B"xField"%3A"events_in_eur"%2C"yField"%3A%5B"events_in_eur_with_round_0"%5D%7D%2C"eChartsConfig"%3A%7B"series"%3A%5B%7B"encode"%3A%7B"xRef"%3A%7B"field"%3A"events_in_eur"%7D%2C"yRef"%3A%7B"field"%3A"events_in_eur_with_round_0"%7D%7D%2C"type"%3A"bar"%7D%5D%7D%7D%7D%7D`;
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
