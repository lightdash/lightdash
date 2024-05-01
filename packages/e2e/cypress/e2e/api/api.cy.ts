import { MetricFilterRule, MetricQuery, SEED_PROJECT } from '@lightdash/common';

const apiUrl = '/api/v1';

const runqueryBody: MetricQuery = {
    exploreName: 'customers',
    dimensions: ['customers_customer_id'],
    metrics: [],
    filters: {},
    sorts: [{ fieldId: 'customers_customer_id', descending: false }],
    limit: 500,
    tableCalculations: [],
    additionalMetrics: [],
};
const sqlQueryBody = { sql: 'select 1' };
describe('API', () => {
    beforeEach(() => {
        cy.login();
    });

    it('Should identify user', () => {
        cy.request(`${apiUrl}/user`).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body.results).to.have.property(
                'email',
                'demo@lightdash.com',
            );
        });
    });

    it('Should get success response (200) from GET public endpoints', () => {
        const endpoints = ['/livez', '/health', '/flash'];
        endpoints.forEach((endpoint) => {
            cy.request(`${apiUrl}${endpoint}`).then((resp) => {
                cy.log(resp.body);
                expect(resp.status).to.eq(200);
                expect(resp.body).to.have.property('status', 'ok');
            });
        });
    });

    it('Should get success response (200) from GET projectRouter endpoints', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoints = [
            `/projects/${projectUuid}`,
            `/projects/${projectUuid}/explores`,
            `/projects/${projectUuid}/most-popular-and-recently-updated`,
            `/projects/${projectUuid}/dashboards`,
            `/projects/${projectUuid}/catalog`,
            `/projects/${projectUuid}/tablesConfiguration`,
            `/projects/${projectUuid}/hasSavedCharts`,
        ];
        /* Not tested
      /projects/:projectUuid/explores/:exploreId
*/
        endpoints.forEach((endpoint) => {
            cy.request(`${apiUrl}${endpoint}`).then((resp) => {
                cy.log(resp.body);
                expect(resp.status).to.eq(200);
                expect(resp.body).to.have.property('status', 'ok');
            });
        });
    });

    it('Should get list of dashboards from projects', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        cy.request(`${apiUrl}/projects/${projectUuid}/dashboards`).then(
            (resp) => {
                cy.log(resp.body);
                expect(resp.status).to.eq(200);
                expect(resp.body).to.have.property('status', 'ok');

                expect(resp.body.results[0]).to.have.property(
                    'name',
                    'Jaffle dashboard',
                );
            },
        );
    });

    it('Should get success response (200) from POST runQuery', () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        const endpoint = `/projects/${projectUuid}/explores/customers/runQuery`;
        cy.request({
            url: `${apiUrl}${endpoint}`,
            headers: { 'Content-type': 'application/json' },
            method: 'POST',
            body: runqueryBody,
        }).then((resp) => {
            cy.log(resp.body);
            expect(resp.status).to.eq(200);
            expect(resp.body).to.have.property('status', 'ok');
        });
    });

    it('Should get success response (200) from POST sqlQuery', () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        const endpoint = `/projects/${projectUuid}/sqlQuery`;
        cy.request({
            url: `${apiUrl}${endpoint}`,
            headers: { 'Content-type': 'application/json' },
            method: 'POST',
            body: sqlQueryBody,
        }).then((resp) => {
            cy.log(resp.body);
            expect(resp.status).to.eq(200);
            expect(resp.body).to.have.property('status', 'ok');
        });
    });

    it('Should get success response (200) from PATCH project', () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        const endpoint = `${apiUrl}/projects/${projectUuid}`;

        // Fetch the existing project first and patching with the same data
        cy.request(endpoint).then((projectResponse) => {
            cy.log(projectResponse.body);
            expect(projectResponse.status).to.eq(200);

            cy.request({
                url: endpoint,
                headers: { 'Content-type': 'application/json' },
                method: 'PATCH',
                body: projectResponse.body.results,
            }).then((resp) => {
                cy.log(resp.body);
                expect(resp.status).to.eq(200);
                expect(resp.body).to.have.property('status', 'ok');
            });
        });
    });

    it('Should get success response (200) from PATCH dashboard', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        cy.request(`${apiUrl}/projects/${projectUuid}/dashboards`).then(
            (projectResponse) => {
                expect(projectResponse.status).to.eq(200);

                const dashboardUuid = projectResponse.body.results[0].uuid;
                const endpoint = `${apiUrl}/dashboards/${dashboardUuid}`;

                cy.request(endpoint).then((dashboardResponse) => {
                    expect(dashboardResponse.status).to.eq(200);
                    expect(dashboardResponse.body.results).to.have.property(
                        'name',
                        'Jaffle dashboard',
                    );

                    const dashboard = dashboardResponse.body.results;
                    cy.request({
                        url: endpoint,
                        headers: { 'Content-type': 'application/json' },
                        method: 'PATCH',
                        body: {
                            name: dashboard.name,
                            tiles: dashboard.tiles,
                            filters: dashboard.filters,
                            tabs: dashboard.tabs,
                        },
                    }).then((resp) => {
                        expect(resp.status).to.eq(200);
                        expect(resp.body).to.have.property('status', 'ok');
                    });
                });
            },
        );
    });

    it('Should get success response (200) from GET savedChartRouter endpoints', () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        cy.request(`${apiUrl}/projects/${projectUuid}/charts`).then(
            (projectResponse) => {
                expect(projectResponse.status).to.eq(200);

                const savedChartUuid = projectResponse.body.results[0].uuid;

                const endpoints = [
                    `/saved/${savedChartUuid}`,
                    `/saved/${savedChartUuid}/availableFilters`,
                ];

                endpoints.forEach((endpoint) => {
                    cy.request(`${apiUrl}${endpoint}`).then((resp) => {
                        expect(resp.status).to.eq(200);
                        expect(resp.body).to.have.property('status', 'ok');
                    });
                });
            },
        );
    });

    it('Should get success response (200) from GET organizationRouter endpoints', () => {
        const endpoints = [
            `/org`,
            `/org/projects`,
            `/org/users`,
            `/org/onboardingStatus`,
        ];
        // Note:  `/org/projects` endpoint fails with 413 if we don't give conten-type:json headers
        endpoints.forEach((endpoint) => {
            cy.request({
                url: `${apiUrl}${endpoint}`,
                headers: { 'Content-type': 'application/json' },
            }).then((resp) => {
                expect(resp.status).to.eq(200);
                expect(resp.body).to.have.property('status', 'ok');
            });
        });
    });

    it('Should get success response (200) from GET userRouter endpoints', () => {
        const endpoints = [`/user`, `/user/identities`];
        endpoints.forEach((endpoint) => {
            cy.request(`${apiUrl}${endpoint}`).then((resp) => {
                cy.log(resp.body);
                expect(resp.status).to.eq(200);
                expect(resp.body).to.have.property('status', 'ok');
            });
        });
    });

    it('Should get success response (200) from GET dashboardRouter endpoints', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        cy.request(`${apiUrl}/projects/${projectUuid}/dashboards`).then(
            (projectResponse) => {
                expect(projectResponse.status).to.eq(200);
                cy.log(projectResponse.body);

                const dashboardUuid = projectResponse.body.results[0].uuid;
                const endpoints = [`/dashboards/${dashboardUuid}`];
                endpoints.forEach((endpoint) => {
                    cy.request(`${apiUrl}${endpoint}`).then((resp) => {
                        cy.log(resp.body);
                        expect(resp.status).to.eq(200);
                        expect(resp.body).to.have.property('status', 'ok');
                    });
                });
            },
        );
    });

    it('Should get metric filters from events', () => {
        cy.request({
            url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/explores/events`,
            headers: { 'Content-type': 'application/json' },
            failOnStatusCode: false,
        }).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body).to.have.property('status', 'ok');
            const removeIds = (filters: MetricFilterRule[]) =>
                filters.map((filter) => ({ ...filter, id: undefined }));
            const metricFilters = removeIds(
                resp.body.results.tables.events.metrics.with_filters
                    .filters as MetricFilterRule[],
            );
            expect(metricFilters).to.have.length(3);
            expect(metricFilters[0]).to.deep.equal({
                id: undefined,
                operator: 'notNull',
                values: [1],
                target: { fieldRef: 'event_id' },
            });
            expect(metricFilters[1]).to.deep.equal({
                id: undefined,
                operator: 'greaterThan',
                values: [5],
                target: { fieldRef: 'event_id' },
            });
            expect(metricFilters[2]).to.deep.equal({
                id: undefined,
                operator: 'equals',
                values: ['song_played'],
                target: { fieldRef: 'event' },
            });
        });
    });
});

describe('API forbidden tests', () => {
    beforeEach(() => {
        cy.anotherLogin();
    });

    it('Test login from another user', () => {
        // Test new user registered
        cy.request(`${apiUrl}/user`).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body.results).to.have.property(
                'email',
                'another@lightdash.com',
            );
        });
    });
    it('Should get forbidden error (403) from GET project endpoints from another organization', () => {
        const projectUuid = SEED_PROJECT.project_uuid; // Same project_uuid that belongs to another organization
        const endpoints = [
            `/projects/${projectUuid}`,
            `/projects/${projectUuid}/explores`,
            `/projects/${projectUuid}/spaces`,
            // `/projects/${projectUuid}/dashboards`, // This will return 200 but an empty list, check test below
            `/projects/${projectUuid}/catalog`,
            `/projects/${projectUuid}/tablesConfiguration`,
            `/projects/${projectUuid}/hasSavedCharts`,
        ];
        /* Not tested
        /projects/:projectUuid/explores/:exploreId
    */
        endpoints.forEach((endpoint) => {
            cy.request({
                url: `${apiUrl}${endpoint}`,
                failOnStatusCode: false,
            }).then((resp) => {
                expect(resp.status).to.eq(403);
            });
        });
    });

    it('Should get an empty list of dashboards from projects', () => {
        cy.anotherLogin();

        const projectUuid = SEED_PROJECT.project_uuid;
        cy.request({
            url: `${apiUrl}/projects/${projectUuid}/dashboards`,
            failOnStatusCode: false,
        }).then((resp) => {
            cy.log(resp.body);
            expect(resp.status).to.eq(200);
            expect(resp.body).to.have.property('status', 'ok');

            expect(resp.body.results).to.have.length(0);
        });
    });

    it('Should get forbidden error (403) from POST runQuery', () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        const endpoint = `/projects/${projectUuid}/explores/customers/runQuery`;
        cy.request({
            url: `${apiUrl}${endpoint}`,
            headers: { 'Content-type': 'application/json' },
            method: 'POST',
            body: runqueryBody,
            failOnStatusCode: false,
        }).then((resp) => {
            expect(resp.status).to.eq(403);
        });
    });

    it('Should get forbidden error (403) from POST sqlQuery', () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        const endpoint = `/projects/${projectUuid}/sqlQuery`;
        cy.request({
            url: `${apiUrl}${endpoint}`,
            headers: { 'Content-type': 'application/json' },
            method: 'POST',
            body: sqlQueryBody,
            failOnStatusCode: false,
        }).then((resp) => {
            expect(resp.status).to.eq(403);
        });
    });

    it('Should get forbidden error (403) from PATCH project', () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        const endpoint = `${apiUrl}/projects/${projectUuid}`;

        cy.request({
            url: endpoint,
            headers: { 'Content-type': 'application/json' },
            method: 'PATCH',
            body: {},
            failOnStatusCode: false,
        }).then((resp) => {
            expect(resp.status).to.eq(403);
        });
    });
    it('Should get forbidden error (403) from GET savedChart endpoints from another organization', () => {
        cy.login(); // Make request as first user to get the chartUuid

        const projectUuid = SEED_PROJECT.project_uuid;
        cy.request(`${apiUrl}/projects/${projectUuid}/charts`).then(
            (projectResponse) => {
                expect(projectResponse.status).to.eq(200);
                cy.log(projectResponse.body);
                const savedChartUuid = projectResponse.body.results[0].uuid;

                cy.anotherLogin(); // Now we login as another user

                const endpoints = [
                    `/saved/${savedChartUuid}`,
                    `/saved/${savedChartUuid}/availableFilters`,
                ];

                endpoints.forEach((endpoint) => {
                    cy.request({
                        url: `${apiUrl}${endpoint}`,
                        failOnStatusCode: false,
                    }).then((resp) => {
                        expect(resp.status).to.eq(403);
                    });
                });
            },
        );
    });

    it('Should get an empty project list (200) from GET /org/projects', () => {
        cy.request({
            url: `${apiUrl}/org/projects`,
            headers: { 'Content-type': 'application/json' },
            failOnStatusCode: false,
        }).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body).to.have.property('status', 'ok');
            expect(resp.body.results).to.have.length(0);
        });
    });

    it('Should get forbidden error (403) from GET dashboardRouter endpoints', () => {
        cy.login(); // Make request as first user to get the chartUuid

        const projectUuid = SEED_PROJECT.project_uuid;
        cy.request(`${apiUrl}/projects/${projectUuid}/dashboards`).then(
            (projectResponse) => {
                expect(projectResponse.status).to.eq(200);
                cy.log(projectResponse.body);

                cy.anotherLogin(); // Now we login as another user

                const dashboardUuid = projectResponse.body.results[0].uuid;
                const endpoints = [`/dashboards/${dashboardUuid}`];
                endpoints.forEach((endpoint) => {
                    cy.request({
                        url: `${apiUrl}${endpoint}`,
                        failOnStatusCode: false,
                    }).then((resp) => {
                        expect(resp.status).to.eq(403);
                    });
                });
            },
        );
    });
    it('Should get forbidden error (403) from PATCH dashboard', () => {
        cy.login(); // Make request as first user to get the chartUuid

        const projectUuid = SEED_PROJECT.project_uuid;
        cy.request(`${apiUrl}/projects/${projectUuid}/dashboards`).then(
            (projectResponse) => {
                expect(projectResponse.status).to.eq(200);
                cy.log(projectResponse.body);

                const dashboardUuid = projectResponse.body.results[0].uuid;
                const endpoint = `${apiUrl}/dashboards/${dashboardUuid}`;

                cy.anotherLogin(); // Now we login as another user

                cy.request({
                    url: endpoint,
                    headers: { 'Content-type': 'application/json' },
                    method: 'PATCH',
                    body: {
                        name: '',
                        filters: {
                            metrics: [],
                            dimensions: [],
                        },
                        tiles: [],
                    },
                    failOnStatusCode: false,
                }).then((resp) => {
                    expect(resp.status).to.eq(403);
                });
            },
        );
    });
});
