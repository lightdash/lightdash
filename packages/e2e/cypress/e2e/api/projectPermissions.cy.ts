import { SEED_PROJECT } from '@lightdash/common';

const apiUrl = '/api/v1';

const runqueryBody = {
    dimensions: ['customers_customer_id'],
    metrics: [],
    filters: {},
    sorts: [{ fieldId: 'customers_customer_id', descending: false }],
    limit: 500,
    tableCalculations: [],
    additionalMetrics: [],
};
const sqlQueryBody = { sql: 'select 1' };
describe('Lightdash API tests for member user with admin project permissions', () => {
    let email;
    beforeEach(() => {
        cy.loginWithPermissions('member', [
            {
                role: 'admin',
                projectUuid: SEED_PROJECT.project_uuid,
            },
        ]).then((e) => {
            email = e;
        });
    });
    it('Should identify user', () => {
        cy.request(`${apiUrl}/user`).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body.results).to.have.property('email', email);
            expect(resp.body.results).to.have.property('role', 'member');
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

    it('Should get success response (200) from GET projectRouter endpoints', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoints = [
            `/projects/${projectUuid}`,
            `/projects/${projectUuid}/explores`,
            `/projects/${projectUuid}/spaces`,
            `/projects/${projectUuid}/dashboards`,
            `/projects/${projectUuid}/catalog`,
            `/projects/${projectUuid}/tablesConfiguration`,
            `/projects/${projectUuid}/hasSavedCharts`,
        ];

        endpoints.forEach((endpoint) => {
            cy.request(`${apiUrl}${endpoint}`).then((resp) => {
                expect(resp.status).to.eq(200);
                expect(resp.body).to.have.property('status', 'ok');
            });
        });
    });

    it('Should get list of dashboards from projects', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        cy.request(`${apiUrl}/projects/${projectUuid}/dashboards`).then(
            (resp) => {
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
            expect(resp.status).to.eq(200);
            expect(resp.body).to.have.property('status', 'ok');
        });
    });

    it('Should get success response (200) from PATCH project', () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        const endpoint = `${apiUrl}/projects/${projectUuid}`;

        // Fetch the existing project first and patching with the same data
        cy.request(endpoint).then((projectResponse) => {
            expect(projectResponse.status).to.eq(200);

            cy.request({
                url: endpoint,
                headers: { 'Content-type': 'application/json' },
                method: 'PATCH',
                body: projectResponse.body.results,
            }).then((resp) => {
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
        cy.request(`${apiUrl}/projects/${projectUuid}/spaces`).then(
            (projectResponse) => {
                expect(projectResponse.status).to.eq(200);

                const savedChartUuid =
                    projectResponse.body.results[0].queries[0].uuid;

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

                const dashboardUuid = projectResponse.body.results[0].uuid;
                const endpoints = [`/dashboards/${dashboardUuid}`];
                endpoints.forEach((endpoint) => {
                    cy.request(`${apiUrl}${endpoint}`).then((resp) => {
                        expect(resp.status).to.eq(200);
                        expect(resp.body).to.have.property('status', 'ok');
                    });
                });
            },
        );
    });
});

describe('Lightdash API tests for member user with editor project permissions', () => {
    let email;
    beforeEach(() => {
        cy.loginWithPermissions('member', [
            {
                role: 'editor',
                projectUuid: SEED_PROJECT.project_uuid,
            },
        ]).then((e) => {
            email = e;
        });
    });
    it('Should identify user', () => {
        cy.request(`${apiUrl}/user`).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body.results).to.have.property('email', email);
            expect(resp.body.results).to.have.property('role', 'member');
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

    it('Should get success response (200) from GET projectRouter endpoints', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoints = [
            `/projects/${projectUuid}`,
            `/projects/${projectUuid}/explores`,
            `/projects/${projectUuid}/spaces`,
            `/projects/${projectUuid}/dashboards`,
            `/projects/${projectUuid}/catalog`,
            `/projects/${projectUuid}/tablesConfiguration`,
            `/projects/${projectUuid}/hasSavedCharts`,
        ];

        endpoints.forEach((endpoint) => {
            cy.request(`${apiUrl}${endpoint}`).then((resp) => {
                expect(resp.status).to.eq(200);
                expect(resp.body).to.have.property('status', 'ok');
            });
        });
    });

    it('Should get list of dashboards from projects', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        cy.request(`${apiUrl}/projects/${projectUuid}/dashboards`).then(
            (resp) => {
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
            expect(resp.status).to.eq(200);
            expect(resp.body).to.have.property('status', 'ok');
        });
    });

    it('Should get a forbidden (403) from PATCH project', () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        const endpoint = `${apiUrl}/projects/${projectUuid}`;

        // Fetch the existing project first and patching with the same data
        cy.request(endpoint).then((projectResponse) => {
            expect(projectResponse.status).to.eq(200);

            cy.request({
                url: endpoint,
                headers: { 'Content-type': 'application/json' },
                method: 'PATCH',
                body: projectResponse.body.results,
                failOnStatusCode: false,
            }).then((resp) => {
                expect(resp.status).to.eq(403);
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
        cy.request(`${apiUrl}/projects/${projectUuid}/spaces`).then(
            (projectResponse) => {
                expect(projectResponse.status).to.eq(200);

                const savedChartUuid =
                    projectResponse.body.results[0].queries[0].uuid;

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

                const dashboardUuid = projectResponse.body.results[0].uuid;
                const endpoints = [`/dashboards/${dashboardUuid}`];
                endpoints.forEach((endpoint) => {
                    cy.request(`${apiUrl}${endpoint}`).then((resp) => {
                        expect(resp.status).to.eq(200);
                        expect(resp.body).to.have.property('status', 'ok');
                    });
                });
            },
        );
    });
});

describe('Lightdash API tests for member user with viewer project permissions', () => {
    let email;
    beforeEach(() => {
        cy.loginWithPermissions('member', [
            {
                role: 'viewer',
                projectUuid: SEED_PROJECT.project_uuid,
            },
        ]).then((e) => {
            email = e;
        });
    });
    it('Should identify user', () => {
        cy.request(`${apiUrl}/user`).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body.results).to.have.property('email', email);
            expect(resp.body.results).to.have.property('role', 'member');
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

    it('Should get success response (200) from GET projectRouter endpoints', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoints = [
            `/projects/${projectUuid}`,
            `/projects/${projectUuid}/explores`,
            `/projects/${projectUuid}/spaces`,
            `/projects/${projectUuid}/dashboards`,
            `/projects/${projectUuid}/catalog`,
            `/projects/${projectUuid}/tablesConfiguration`,
            `/projects/${projectUuid}/hasSavedCharts`,
        ];

        endpoints.forEach((endpoint) => {
            cy.request(`${apiUrl}${endpoint}`).then((resp) => {
                expect(resp.status).to.eq(200);
                expect(resp.body).to.have.property('status', 'ok');
            });
        });
    });

    it('Should get list of dashboards from projects', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        cy.request(`${apiUrl}/projects/${projectUuid}/dashboards`).then(
            (resp) => {
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
            expect(resp.status).to.eq(200);
            expect(resp.body).to.have.property('status', 'ok');
        });
    });

    it('Should get forbidden (403) from POST sqlQuery', () => {
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

    it('Should get a forbidden (403) from PATCH project', () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        const endpoint = `${apiUrl}/projects/${projectUuid}`;

        // Fetch the existing project first and patching with the same data
        cy.request(endpoint).then((projectResponse) => {
            expect(projectResponse.status).to.eq(200);

            cy.request({
                url: endpoint,
                headers: { 'Content-type': 'application/json' },
                method: 'PATCH',
                body: projectResponse.body.results,
                failOnStatusCode: false,
            }).then((resp) => {
                expect(resp.status).to.eq(403);
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

                cy.request({
                    url: endpoint,
                    headers: { 'Content-type': 'application/json' },
                    method: 'PATCH',
                    body: {
                        name: 'test',
                        tiles: [],
                        filters: { dimensions: [], metrics: [] },
                    },
                    failOnStatusCode: false,
                }).then((resp) => {
                    expect(resp.status).to.eq(403);
                });
            },
        );
    });
    it('Should get success response (200) from GET savedChartRouter endpoints', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        cy.request(`${apiUrl}/projects/${projectUuid}/spaces`).then(
            (projectResponse) => {
                expect(projectResponse.status).to.eq(200);

                const savedChartUuid =
                    projectResponse.body.results[0].queries[0].uuid;

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

                const dashboardUuid = projectResponse.body.results[0].uuid;
                const endpoints = [`/dashboards/${dashboardUuid}`];
                endpoints.forEach((endpoint) => {
                    cy.request(`${apiUrl}${endpoint}`).then((resp) => {
                        expect(resp.status).to.eq(200);
                        expect(resp.body).to.have.property('status', 'ok');
                    });
                });
            },
        );
    });
});

describe('Lightdash API tests for member user with NO project permissions', () => {
    let email;
    beforeEach(() => {
        cy.loginWithPermissions('member', []).then((e) => {
            email = e;
        });
    });
    it('Should identify user', () => {
        cy.request(`${apiUrl}/user`).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body.results).to.have.property('email', email);
            expect(resp.body.results).to.have.property('role', 'member');
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

    it('Should get forbidden error (403) from GET project endpoints from another organization', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoints = [
            `/projects/${projectUuid}`,
            `/projects/${projectUuid}/explores`,
            // `/projects/${projectUuid}/spaces`,  // This will return 200 but an empty list, check test below
            `/projects/${projectUuid}/catalog`,
            `/projects/${projectUuid}/tablesConfiguration`,
            `/projects/${projectUuid}/hasSavedCharts`,
        ];

        endpoints.forEach((endpoint) => {
            cy.request({
                url: `${apiUrl}${endpoint}`,
                timeout: 500,
                failOnStatusCode: false,
            }).then((resp) => {
                expect(resp.status).to.eq(403);
            });
        });
    });

    it('Should get an empty list of spaces from projects', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        cy.request(`${apiUrl}/projects/${projectUuid}/spaces`).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body).to.have.property('status', 'ok');

            expect(resp.body.results).to.have.length(0);
        });
    });

    it('Should get an empty list of dashboards from projects', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        cy.request(`${apiUrl}/projects/${projectUuid}/dashboards`).then(
            (resp) => {
                expect(resp.status).to.eq(200);
                expect(resp.body).to.have.property('status', 'ok');

                expect(resp.body.results).to.have.length(0);
            },
        );
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

    it('Should get a forbidden (403) from PATCH project', () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        const endpoint = `${apiUrl}/projects/${projectUuid}`;

        cy.request({
            url: endpoint,
            headers: { 'Content-type': 'application/json' },
            method: 'PATCH',
            body: { name: 'test' },
            failOnStatusCode: false,
        }).then((resp) => {
            expect(resp.status).to.eq(403);
        });
    });

    it('Should get 404 from GET /org/projects', () => {
        cy.request({
            url: `${apiUrl}/org/projects`,
            headers: { 'Content-type': 'application/json' },
            failOnStatusCode: false,
        }).then((resp) => {
            expect(resp.status).to.eq(404);
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
