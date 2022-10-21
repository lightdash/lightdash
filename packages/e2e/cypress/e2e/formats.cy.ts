import { SEED_PROJECT } from '@lightdash/common';

describe('Explore', () => {
    before(() => {
        cy.login();
    });

    beforeEach(() => {
        Cypress.Cookies.preserveOnce('connect.sid');
    });

    it('Should query in explore with formats and rounds', () => {
        const exploreUrlParams = `?create_saved_chart_version={"tableName"%3A"events"%2C"metricQuery"%3A{"dimensions"%3A[]%2C"metrics"%3A["events_in_eur"%2C"events_in_eur_with_round_0"%2C"events_in_eur_with_round_2"%2C"events_in_gbp"%2C"events_in_km"%2C"events_in_mi"%2C"events_in_percent"]%2C"filters"%3A{}%2C"sorts"%3A[{"fieldId"%3A"events_in_eur"%2C"descending"%3Atrue}]%2C"limit"%3A1%2C"tableCalculations"%3A[]%2C"additionalMetrics"%3A[]}%2C"tableConfig"%3A{"columnOrder"%3A["events_in_eur"%2C"events_in_eur_with_round_0"%2C"events_in_eur_with_round_2"%2C"events_in_gbp"%2C"events_in_km"%2C"events_in_mi"%2C"events_in_percent"]}%2C"chartConfig"%3A{"type"%3A"cartesian"%2C"config"%3A{"layout"%3A{"xField"%3A"events_in_eur"%2C"yField"%3A["events_in_eur_with_round_0"]}%2C"eChartsConfig"%3A{"series"%3A[{"encode"%3A{"xRef"%3A{"field"%3A"events_in_eur"}%2C"yRef"%3A{"field"%3A"events_in_eur_with_round_0"}}%2C"type"%3A"bar"}]}}}}`;
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
