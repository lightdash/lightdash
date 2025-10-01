import { SEED_PROJECT } from '@lightdash/common';

const apiUrl = '/api/v2';

describe('Spreadsheet Formula Table Calculations (v2 API)', () => {
    beforeEach(() => {
        cy.login();
    });

    it('Should execute async query with spreadsheet formula table calculation "1 + 1"', () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        const requestBody = {
            query: {
                exploreName: 'orders',
                dimensions: ['orders_order_id'],
                metrics: ['orders_total_order_amount'],
                filters: {},
                sorts: [
                    {
                        fieldId: 'orders_order_id',
                        descending: false,
                    },
                ],
                limit: 10,
                tableCalculations: [
                    {
                        name: 'test_spreadsheet_formula',
                        displayName: 'Test Spreadsheet Formula',
                        spreadsheetFormula: '1 + 1',
                    },
                ],
                additionalMetrics: [],
            },
        };

        const endpoint = `${apiUrl}/projects/${projectUuid}/query/metric-query`;

        // Step 1: Execute async query
        cy.request({
            url: endpoint,
            headers: { 'Content-type': 'application/json' },
            method: 'POST',
            body: requestBody,
        }).then((executeResp) => {
            expect(executeResp.status).to.eq(200);
            expect(executeResp.body).to.have.property('status', 'ok');
            expect(executeResp.body.results).to.have.property('queryUuid');

            const { queryUuid } = executeResp.body.results;

            // Step 2: Poll for results (retry until complete)
            const getResults = (retries = 0): void => {
                if (retries > 10) {
                    throw new Error('Query took too long to complete');
                }

                cy.request({
                    url: `${apiUrl}/projects/${projectUuid}/query/${queryUuid}`,
                    headers: { 'Content-type': 'application/json' },
                    method: 'GET',
                    failOnStatusCode: false,
                }).then((resultsResp) => {
                    if (resultsResp.status === 200) {
                        expect(resultsResp.body).to.have.property(
                            'status',
                            'ok',
                        );
                        const { results } = resultsResp.body;

                        // Verify query metadata contains table calculation
                        expect(
                            results.metricQuery.tableCalculations,
                        ).to.have.lengthOf(1);
                        expect(
                            results.metricQuery.tableCalculations[0],
                        ).to.have.property('name', 'test_spreadsheet_formula');

                        // Verify result rows contain the table calculation column
                        expect(results.rows.length).to.be.greaterThan(0);
                        expect(results.rows[0]).to.have.property(
                            'test_spreadsheet_formula',
                        );

                        // Verify all rows have the value 2 (since 1 + 1 = 2)
                        results.rows.forEach((row: Record<string, unknown>) => {
                            expect(row.test_spreadsheet_formula).to.equal(2);
                        });
                    } else {
                        // Query still running, retry
                        cy.wait(500);
                        getResults(retries + 1);
                    }
                });
            };

            getResults();
        });
    });
});
