/* eslint-disable @typescript-eslint/no-explicit-any */
const apiUrl = '/api/v2';

const runQueryBody = {
    context: 'exploreView',
    query: {
        exploreName: 'events',
        dimensions: ['events_event_tier', 'events_event_id'],
        metrics: ['events_count', 'events_in_dkk'],
        filters: {},
        sorts: [{ fieldId: 'events_count', descending: true }],
        limit: 2500,
        tableCalculations: [],
        additionalMetrics: [],
        metricOverrides: {},
    },
};

describe('Async Query API', () => {
    let pgProjectUuid: string;
    let snowflakeProjectUuid: string;

    before(() => {
        cy.login();

        cy.request('/api/v1/org/projects').then((response) => {
            expect(response.status).to.eq(200);
            expect(response.body).to.have.property('status', 'ok');

            const projects = response.body.results;
            // Find postgres project
            const pgProject = projects.find(
                (p: any) => p.warehouseType === 'postgres',
            );
            pgProjectUuid = pgProject.projectUuid;

            // Find snowflake project
            const snowflakeProject = projects.find(
                (p: any) => p.warehouseType === 'snowflake',
            );
            snowflakeProjectUuid = snowflakeProject.projectUuid;
        });
    });

    beforeEach(() => {
        cy.login();
    });

    it('Postgres: should execute async query and get all results', () => {
        const projectUuid = pgProjectUuid;

        // First execute the async query
        cy.request({
            url: `${apiUrl}/projects/${projectUuid}/query`,
            method: 'POST',
            headers: { 'Content-type': 'application/json' },
            body: runQueryBody,
        }).then((executeResp) => {
            expect(executeResp.status).to.eq(200);
            expect(executeResp.body).to.have.property('status', 'ok');
            expect(executeResp.body.results).to.have.property('queryUuid');

            const { queryUuid } = executeResp.body.results;

            // Then get the results using the queryUuid
            cy.request({
                url: `${apiUrl}/projects/${projectUuid}/query/${queryUuid}`,
                method: 'GET',
            }).then((resultsResp) => {
                expect(resultsResp.status).to.eq(200);
                expect(resultsResp.body).to.have.property('status', 'ok');
                expect(resultsResp.body.results).to.have.property('rows');
                expect(resultsResp.body.results.rows).to.be.an('array');
                expect(resultsResp.body.results.rows.length).to.be.greaterThan(
                    2000, // Really, 2007, but that's kinda fragile
                );
            });

            // Then get the results using the queryUuid, paged
            cy.request({
                url: `${apiUrl}/projects/${projectUuid}/query/${queryUuid}?page=2&pageSize=100`,
                method: 'GET',
            }).then((resultsResp) => {
                expect(resultsResp.status).to.eq(200);
                expect(resultsResp.body).to.have.property('status', 'ok');
                expect(resultsResp.body.results).to.have.property('rows');
                expect(resultsResp.body.results.rows).to.be.an('array');
                // Currently fetch all of the results in postgress
                // With caching this should be 100, and on snowflake
                expect(resultsResp.body.results.rows.length).to.be.greaterThan(
                    2000, // Really, 2007, but that's kinda fragile
                );
            });
        });
    });

    it('snowflake: should execute async query and get all results', () => {
        const projectUuid = snowflakeProjectUuid;

        cy.log('First execute the async query');
        cy.request({
            url: `${apiUrl}/projects/${projectUuid}/query`,
            method: 'POST',
            headers: { 'Content-type': 'application/json' },
            body: runQueryBody,
        }).then((executeResp) => {
            expect(executeResp.status).to.eq(200);
            expect(executeResp.body).to.have.property('status', 'ok');
            expect(executeResp.body.results).to.have.property('queryUuid');

            const { queryUuid } = executeResp.body.results;

            cy.log('Poll for results until ready');
            // Poll for results until ready
            const checkResults = (): any =>
                cy
                    .request({
                        url: `${apiUrl}/projects/${projectUuid}/query/${queryUuid}`,
                        method: 'GET',
                    })
                    .then((resultsResp: any) => {
                        if (resultsResp.body.results.status !== 'ready') {
                            // If not ready, wait 200ms and try again
                            cy.wait(200);
                            return checkResults();
                        }
                        return resultsResp;
                    });

            let pageOneResults: any;

            // default results are 500
            checkResults().then((resultsResp: any) => {
                expect(resultsResp.status).to.eq(200);
                expect(resultsResp.body).to.have.property('status', 'ok');
                expect(resultsResp.body.results).to.have.property('rows');
                expect(resultsResp.body.results.rows).to.be.an('array');
                expect(resultsResp.body.results.rows.length).to.be.eq(500);
                pageOneResults = resultsResp.body.results.rows;
            });

            cy.log(
                'Get the right number of results in a page, check the page content',
            );
            cy.request({
                url: `${apiUrl}/projects/${projectUuid}/query/${queryUuid}?page=1&pageSize=500`,
                method: 'GET',
            }).then((resultsResp) => {
                expect(resultsResp.status).to.eq(200);
                expect(resultsResp.body).to.have.property('status', 'ok');
                expect(resultsResp.body.results).to.have.property('rows');
                expect(resultsResp.body.results.rows).to.be.an('array');
                expect(resultsResp.body.results.rows.length).to.be.eq(500);
                // Should be the same rows as the default
                expect(resultsResp.body.results.rows).to.deep.eq(
                    pageOneResults,
                );
            });

            cy.log('Get page 2');
            cy.request({
                url: `${apiUrl}/projects/${projectUuid}/query/${queryUuid}?page=2&pageSize=500`,
                method: 'GET',
            }).then((resultsResp) => {
                expect(resultsResp.status).to.eq(200);
                expect(resultsResp.body).to.have.property('status', 'ok');
                expect(resultsResp.body.results).to.have.property('rows');
                expect(resultsResp.body.results.rows).to.be.an('array');
                expect(resultsResp.body.results.rows.length).to.be.eq(500);
                // Should NOT be the same rows as the default
                expect(resultsResp.body.results.rows).not.to.deep.eq(
                    pageOneResults,
                );
            });

            cy.log(
                'get the first 100 results and check the content against the saved 1st 100',
            );
            cy.request({
                url: `${apiUrl}/projects/${projectUuid}/query/${queryUuid}?page=1&pageSize=100`,
                method: 'GET',
            }).then((resultsResp) => {
                expect(resultsResp.status).to.eq(200);
                expect(resultsResp.body).to.have.property('status', 'ok');
                expect(resultsResp.body.results).to.have.property('rows');
                expect(resultsResp.body.results.rows).to.be.an('array');
                expect(resultsResp.body.results.rows.length).to.be.eq(100);
                // Should be the same as the first 100 rows from pageOneResults
                expect(resultsResp.body.results.rows).to.deep.eq(
                    pageOneResults.slice(0, 100),
                );
            });

            // Add checks for over the final page
        });
    });
});
