/* eslint-disable @typescript-eslint/no-explicit-any */
import warehouseConnections from '../../support/warehouses';

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

const waitForJobCompletion = (jobUuid: string): Cypress.Chainable<boolean> =>
    cy.request(`api/v1/jobs/${jobUuid}`).then((resp) => {
        const status = resp.body.results.jobStatus;
        if (status === 'ERROR') {
            cy.log(`Job failed: ${resp.body.results.error}`);
            return cy.wrap(false);
        }
        if (status !== 'DONE') {
            cy.wait(1000);
            return waitForJobCompletion(jobUuid);
        }
        return cy.wrap(true);
    });

const createAndRefreshProject = (
    name: string,
    config: any,
): Cypress.Chainable<string | undefined> => {
    let projectUuid: string;
    return cy
        .createProject(name, config)
        .then((uuid) => {
            projectUuid = uuid;
            return cy.request({
                url: `api/v1/projects/${uuid}/refresh`,
                method: 'POST',
            });
        })
        .then((response) => {
            expect(response.status).to.eq(200);
            const { jobUuid } = response.body.results;
            return waitForJobCompletion(jobUuid).then((success: boolean) => {
                if (success) {
                    return cy.wrap(projectUuid);
                }
                cy.log(`Skipping project ${name} due to refresh failure`);
                return cy.wrap(undefined);
            });
        });
};

describe('Async Query API', () => {
    beforeEach(() => {
        cy.login();
    });

    // Helper function for test logic to avoid duplication
    const runAsyncQueryTest = (projectUuid: string | undefined) => {
        if (!projectUuid) {
            cy.log(`Skipping test as project UUID is undefined`);
            expect(false).to.eq(true);
            return;
        }

        cy.log(
            'Check that fetching the query before having a valid query id returns 404',
        );
        cy.request({
            // Dummy queryUuid
            url: `${apiUrl}/projects/${projectUuid}/query/13a00154-d590-40f2-bb27-d541f70aa8c6`,
            method: 'GET',
            failOnStatusCode: false,
        }).then((resultsResp) => {
            expect(resultsResp.status).to.eq(404);
            expect(resultsResp.body).to.have.property('status', 'error');
            expect(resultsResp.body).to.have.property('error');
            expect(resultsResp.body.error.name).to.eq('NotFoundError');
        });

        cy.log('First execute the async query');
        cy.request({
            url: `${apiUrl}/projects/${projectUuid}/query/metric-query`,
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

            // default results
            checkResults().then((resultsResp: any) => {
                expect(resultsResp.status).to.eq(200);
                expect(resultsResp.body).to.have.property('status', 'ok');
                expect(resultsResp.body.results).to.have.property('rows');
                expect(resultsResp.body.results.rows).to.be.an('array');
                expect(resultsResp.body.results.rows.length).to.be.eq(500);
                expect(resultsResp.body.results.totalResults).to.be.greaterThan(
                    2000,
                );
                // ~ 2007 / 500 = 5 pages
                expect(resultsResp.body.results.totalPageCount).to.be.eq(5);
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

            cy.log('Request page beyond available results');
            cy.request({
                url: `${apiUrl}/projects/${projectUuid}/query/${queryUuid}?page=6&pageSize=500`,
                method: 'GET',
                failOnStatusCode: false,
            }).then((resultsResp) => {
                expect(resultsResp.status).to.eq(422);
                expect(resultsResp.body).to.have.property('status', 'error');
                expect(resultsResp.body).to.have.property('error');
                expect(resultsResp.body.error.name).to.eq('PaginationError');
            });
        });
    };

    // Define tests for each database type explicitly
    describe('Postgres', () => {
        let projectUuid: string | undefined;
        const projectName = 'postgresSQL query test';

        it('should execute async query and get all results paged', () => {
            // Create project for this test
            createAndRefreshProject(
                projectName,
                warehouseConnections.postgresSQL,
            ).then((uuid) => {
                projectUuid = uuid;
                runAsyncQueryTest(projectUuid);
            });
        });

        afterEach(() => {
            if (projectUuid) {
                cy.deleteProjectsByName([projectName]);
            }
        });
    });

    describe('Snowflake', () => {
        let projectUuid: string | undefined;
        const projectName = 'snowflake query test';

        it('should execute async query and get all results paged', () => {
            // Create project for this test
            createAndRefreshProject(
                projectName,
                warehouseConnections.snowflake,
            ).then((uuid) => {
                projectUuid = uuid;
                runAsyncQueryTest(projectUuid);
            });
        });

        after(() => {
            if (projectUuid) {
                cy.deleteProjectsByName([projectName]);
            }
        });
    });

    describe('BigQuery', () => {
        let projectUuid: string | undefined;
        const projectName = 'bigquery query test';

        it('should execute async query and get all results paged', () => {
            // Create project for this test
            createAndRefreshProject(
                projectName,
                warehouseConnections.bigQuery,
            ).then((uuid) => {
                projectUuid = uuid;
                runAsyncQueryTest(projectUuid);
            });
        });

        after(() => {
            if (projectUuid) {
                cy.deleteProjectsByName([projectName]);
            }
        });
    });
});
