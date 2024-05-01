import { MetricQuery, SEED_PROJECT } from '@lightdash/common';

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

describe('API organization permission tests', () => {
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

describe('API tests for viewer org user', () => {
    let email;

    before(() => {
        cy.loginWithPermissions('viewer', []).then((e) => {
            email = e;
        });
    });
    beforeEach(() => {
        cy.loginWithEmail(email);
    });
    it('Should identify user', () => {
        cy.request(`${apiUrl}/user`).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body.results).to.have.property('email', email);
            expect(resp.body.results).to.have.property('role', 'viewer');
        });
    });

    it('Should get success response (200) from GET public endpoints', () => {
        const endpoints = ['/livez', '/health', '/flash'];
        endpoints.forEach((endpoint) => {
            cy.request(`${apiUrl}${endpoint}`).then((resp) => {
                expect(resp.status).to.eq(200);
                expect(resp.body).to.have.property('status', 'ok');
            });
        });
    });

    it('Should get success response (200) from GET org', () => {
        const endpoint = `${apiUrl}/org/`;

        cy.request({
            url: endpoint,
            headers: { 'Content-type': 'application/json' },
            method: 'GET',
        }).then((resp) => {
            expect(resp.status).to.eq(200);
        });
    });

    it('Should get a forbidden (403) from POST project', () => {
        const endpoint = `${apiUrl}/org/projects/`;

        cy.request({
            url: endpoint,
            headers: { 'Content-type': 'application/json' },
            method: 'POST',
            body: {},
            failOnStatusCode: false,
        }).then((resp) => {
            expect(resp.status).to.eq(403);
        });
    });

    it('Should get success response (200) from GET userRouter endpoints', () => {
        const endpoints = [`/user`, `/user/identities`];
        endpoints.forEach((endpoint) => {
            cy.request(`${apiUrl}${endpoint}`).then((resp) => {
                expect(resp.status).to.eq(200);
                expect(resp.body).to.have.property('status', 'ok');
            });
        });
    });
});

describe('API tests for interactive_viewer org user', () => {
    let email;

    before(() => {
        cy.loginWithPermissions('interactive_viewer', []).then((e) => {
            email = e;
        });
    });
    beforeEach(() => {
        cy.loginWithEmail(email);
    });
    it('Should identify user', () => {
        cy.request(`${apiUrl}/user`).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body.results).to.have.property('email', email);
            expect(resp.body.results).to.have.property(
                'role',
                'interactive_viewer',
            );
        });
    });

    it('Should get success response (200) from GET public endpoints', () => {
        const endpoints = ['/livez', '/health', '/flash'];
        endpoints.forEach((endpoint) => {
            cy.request(`${apiUrl}${endpoint}`).then((resp) => {
                expect(resp.status).to.eq(200);
                expect(resp.body).to.have.property('status', 'ok');
            });
        });
    });

    it('Should get success response (200) from GET org', () => {
        const endpoint = `${apiUrl}/org/`;

        cy.request({
            url: endpoint,
            headers: { 'Content-type': 'application/json' },
            method: 'GET',
        }).then((resp) => {
            expect(resp.status).to.eq(200);
        });
    });

    it('Should get a credentials error (500) from POST project', () => {
        const endpoint = `${apiUrl}/org/projects/`;

        cy.request({
            url: endpoint,
            headers: { 'Content-type': 'application/json' },
            method: 'POST',
            body: {},
            failOnStatusCode: false,
        }).then((resp) => {
            expect(resp.status).to.eq(500);
        });
    });

    it('Should get success response (200) from GET userRouter endpoints', () => {
        const endpoints = [`/user`, `/user/identities`];
        endpoints.forEach((endpoint) => {
            cy.request(`${apiUrl}${endpoint}`).then((resp) => {
                expect(resp.status).to.eq(200);
                expect(resp.body).to.have.property('status', 'ok');
            });
        });
    });
});
