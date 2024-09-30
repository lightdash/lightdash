import {
    Explore,
    MetricQuery,
    ProjectMemberProfile,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
    SummaryExplore,
} from '@lightdash/common';

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

async function updateExplores(projectUuid: string) {
    const endpoint = `/projects/${projectUuid}/explores`;

    const exploresSummary = await new Promise((resolve) => {
        cy.request(`${apiUrl}${endpoint}`).then(async (resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body).to.have.property('status', 'ok');
            resolve(resp.body.results);
        });
    });
    const explorePromises = (exploresSummary as SummaryExplore[]).map<
        Promise<Explore>
    >(
        async (summary) =>
            new Promise((resolve) => {
                cy.request(`${apiUrl}${endpoint}/${summary.name}`).then(
                    (exploreResp) => {
                        resolve(exploreResp.body.results);
                    },
                );
            }),
    );
    const explores = await Promise.all(explorePromises);
    cy.request({
        url: `${apiUrl}${endpoint}`,
        headers: { 'Content-type': 'application/json' },
        method: 'PUT',
        body: explores,
        failOnStatusCode: false,
    }).then((resp2) => {
        expect(resp2.status).to.eq(200);
        expect(resp2.body).to.have.property('status', 'ok');
    });
}

describe('Lightdash API tests for member user with admin project permissions', () => {
    let email;
    before(() => {
        cy.loginWithPermissions('member', [
            {
                role: 'admin',
                projectUuid: SEED_PROJECT.project_uuid,
            },
        ]).then((e) => {
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
            `/projects/${projectUuid}/charts`,
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

    it('Should get success response (200) from GET scheduler logs', () => {
        cy.request(
            `${apiUrl}/schedulers/${SEED_PROJECT.project_uuid}/logs`,
        ).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body).to.have.property('status', 'ok');
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

    it.skip('Should get success response (200) from PUT explores', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        await updateExplores(projectUuid);
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

    it('Should get success response (200) from GET validation', () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        const endpoint = `/projects/${projectUuid}/validate`;
        cy.request({
            url: `${apiUrl}${endpoint}`,
            method: 'GET',
        }).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body).to.have.property('status', 'ok');
        });
    });
    it('Should get success response (200) from POST validation', () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        const endpoint = `/projects/${projectUuid}/validate`;
        cy.request({
            url: `${apiUrl}${endpoint}`,
            headers: { 'Content-type': 'application/json' },
            method: 'POST',
            body: {},
        }).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body).to.have.property('status', 'ok');
        });
    });

    it('Should get success response (200) from POST validation with explores', () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        const endpoint = `/projects/${projectUuid}/validate`;
        cy.request({
            url: `${apiUrl}${endpoint}`,
            headers: { 'Content-type': 'application/json' },
            method: 'POST',
            body: { explores: [] },
        }).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body).to.have.property('status', 'ok');
        });
    });

    it('Should get success response (200) from POST chart results', () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        // Fetch a chart from spaces
        cy.request(`${apiUrl}/projects/${projectUuid}/charts`).then(
            (spacesResponse) => {
                const savedChartUuid = spacesResponse.body.results[0].uuid;
                const endpoint = `/saved/${savedChartUuid}/results`;
                cy.request({
                    url: `${apiUrl}${endpoint}`,
                    headers: { 'Content-type': 'application/json' },
                    method: 'POST',
                    body: undefined,
                }).then((resp) => {
                    expect(resp.status).to.eq(200);
                    expect(resp.body).to.have.property('status', 'ok');
                });
            },
        );
    });

    it('Should get success response (200) from POST chart-and-results with filters', () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        // Fetch a chart from spaces
        cy.request(`${apiUrl}/projects/${projectUuid}/charts`).then(
            (spacesResponse) => {
                const savedChartUuid = spacesResponse.body.results[0].uuid;
                const endpoint = `/saved/${savedChartUuid}/chart-and-results`;
                cy.request({
                    url: `${apiUrl}${endpoint}`,
                    headers: { 'Content-type': 'application/json' },
                    method: 'POST',
                    body: {
                        dashboardUuid: 'example',
                        dashboardFilters: {
                            metrics: [],
                            dimensions: [],
                            tableCalculations: [],
                        },
                        dashboardSorts: [],
                    },
                }).then((resp) => {
                    expect(resp.status).to.eq(200);
                    expect(resp.body).to.have.property('status', 'ok');
                });
            },
        );
    });
    it('Should get success response (200) from POST runUnderlyingDataQuery', () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        const endpoint = `/projects/${projectUuid}/explores/customers/runUnderlyingDataQuery`;
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

    before(() => {
        cy.loginWithPermissions('member', [
            {
                role: 'editor',
                projectUuid: SEED_PROJECT.project_uuid,
            },
        ]).then((e) => {
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
            `/projects/${projectUuid}/charts`,
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

    it.skip('Should get success response (200) from PUT explores', () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        const endpoint = `/projects/${projectUuid}/explores`;
        cy.request({
            url: `${apiUrl}${endpoint}`,
            headers: { 'Content-type': 'application/json' },
            method: 'PUT',
            body: [],
            failOnStatusCode: false,
        }).then((resp) => {
            expect(resp.status).to.eq(200);
        });
    });

    it('Should get success response (200) from GET scheduler logs', () => {
        cy.request(
            `${apiUrl}/schedulers/${SEED_PROJECT.project_uuid}/logs`,
        ).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body).to.have.property('status', 'ok');
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

    it('Should get success response (200) from POST downloadCsv', () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        const endpoint = `/projects/${projectUuid}/explores/customers/downloadCsv`;
        cy.request({
            url: `${apiUrl}${endpoint}`,
            headers: { 'Content-type': 'application/json' },
            method: 'POST',
            body: {
                ...runqueryBody,
                onlyRaw: false,
                columnOrder: [],
                showTableNames: false,
            },
        }).then((resp) => {
            expect(resp.status).to.eq(200);
            cy.log(`resp.body ${JSON.stringify(resp.body)}`);
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

    it('Should get forbidden (403) from GET validation', () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        const endpoint = `/projects/${projectUuid}/validate`;
        cy.request({
            url: `${apiUrl}${endpoint}`,
            method: 'GET',
            failOnStatusCode: false,
        }).then((resp) => {
            expect(resp.status).to.eq(403);
        });
    });

    it('Should get forbidden (403) from POST validation', () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        const endpoint = `/projects/${projectUuid}/validate`;
        cy.request({
            url: `${apiUrl}${endpoint}`,
            headers: { 'Content-type': 'application/json' },
            method: 'POST',
            body: {},
            failOnStatusCode: false,
        }).then((resp) => {
            expect(resp.status).to.eq(403);
        });
    });

    it('Should get success (200) from PATCH project', () => {
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
                expect(resp.status).to.eq(200);
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

describe('Lightdash API tests for member user with developer project permissions', () => {
    let email;

    before(() => {
        cy.loginWithPermissions('member', [
            {
                role: 'developer',
                projectUuid: SEED_PROJECT.project_uuid,
            },
        ]).then((e) => {
            email = e;
        });
    });
    beforeEach(() => {
        cy.loginWithEmail(email);
    });

    it.skip('Should get success response (200) from PUT explores', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        await updateExplores(projectUuid);
    });

    it('Should get success response (200) from GET scheduler logs', () => {
        cy.request(
            `${apiUrl}/schedulers/${SEED_PROJECT.project_uuid}/logs`,
        ).then((resp) => {
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

    it('Should get success response (200) from GET validation', () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        const endpoint = `/projects/${projectUuid}/validate`;
        cy.request({
            url: `${apiUrl}${endpoint}`,
            method: 'GET',
        }).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body).to.have.property('status', 'ok');
        });
    });
    it('Should get success response (200) from POST validation', () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        const endpoint = `/projects/${projectUuid}/validate`;
        cy.request({
            url: `${apiUrl}${endpoint}`,
            headers: { 'Content-type': 'application/json' },
            method: 'POST',
            body: {},
        }).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body).to.have.property('status', 'ok');
        });
    });
});
describe('Lightdash API tests for member user with interactive_viewer project permissions', () => {
    let email;

    before(() => {
        cy.loginWithPermissions('member', [
            {
                role: 'interactive_viewer',
                projectUuid: SEED_PROJECT.project_uuid,
            },
        ]).then((e) => {
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
            expect(resp.body.results).to.have.property('role', 'member');
        });
    });

    it('Should get forbidden (403) from PUT explores', () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        const endpoint = `/projects/${projectUuid}/explores`;
        cy.request({
            url: `${apiUrl}${endpoint}`,
            headers: { 'Content-type': 'application/json' },
            method: 'PUT',
            body: [],
            failOnStatusCode: false,
        }).then((resp) => {
            expect(resp.status).to.eq(403);
        });
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

    it('Should get forbidden error (403) from GET Scheduler logs', () => {
        cy.request({
            url: `${apiUrl}/schedulers/${SEED_PROJECT.project_uuid}/logs`,
            failOnStatusCode: false,
        }).then((resp) => {
            expect(resp.status).to.eq(403);
        });
    });

    it('Should get success response (200) from POST downloadCsv', () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        const endpoint = `/projects/${projectUuid}/explores/customers/downloadCsv`;
        cy.request({
            url: `${apiUrl}${endpoint}`,
            headers: { 'Content-type': 'application/json' },
            method: 'POST',
            body: {
                ...runqueryBody,
                onlyRaw: false,
                columnOrder: [],
                showTableNames: false,
            },
        }).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body).to.have.property('status', 'ok');
        });
    });
    it('Should get success response (200) from POST runUnderlyingDataQuery', () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        const endpoint = `/projects/${projectUuid}/explores/customers/runUnderlyingDataQuery`;
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

    it('Should get success response (200) from POST chart results', () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        // Fetch a chart from spaces
        cy.request(`${apiUrl}/projects/${projectUuid}/charts`).then(
            (spacesResponse) => {
                const savedChartUuid = spacesResponse.body.results[0].uuid;
                const endpoint = `/saved/${savedChartUuid}/results`;
                cy.request({
                    url: `${apiUrl}${endpoint}`,
                    headers: { 'Content-type': 'application/json' },
                    method: 'POST',
                    body: undefined,
                }).then((resp) => {
                    expect(resp.status).to.eq(200);
                    expect(resp.body).to.have.property('status', 'ok');
                });
            },
        );
    });

    it('Should get success response (200) from POST chart-and-results with filters', () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        // Fetch a chart from spaces
        cy.request(`${apiUrl}/projects/${projectUuid}/charts`).then(
            (spacesResponse) => {
                const savedChartUuid = spacesResponse.body.results[0].uuid;
                const endpoint = `/saved/${savedChartUuid}/chart-and-results`;
                cy.request({
                    url: `${apiUrl}${endpoint}`,
                    headers: { 'Content-type': 'application/json' },
                    method: 'POST',
                    body: {
                        dashboardUuid: 'example',
                        dashboardFilters: {
                            metrics: [],
                            dimensions: [],
                            tableCalculations: [],
                        },
                        dashboardSorts: [],
                    },
                }).then((resp) => {
                    expect(resp.status).to.eq(200);
                    expect(resp.body).to.have.property('status', 'ok');
                });
            },
        );
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

    it('Should get a forbidden (403) from PATCH dashboard', () => {
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
                        filters: {
                            dimensions: [],
                            metrics: [],
                            tableCalculations: [],
                        },
                        tabs: [],
                    },
                    failOnStatusCode: false,
                }).then((resp) => {
                    expect(resp.status).to.eq(403);
                });
            },
        );
    });
});

describe('Lightdash API tests for member user with viewer project permissions', () => {
    let email;

    before(() => {
        cy.loginWithPermissions('member', [
            {
                role: 'viewer',
                projectUuid: SEED_PROJECT.project_uuid,
            },
        ]).then((e) => {
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
            `/projects/${projectUuid}/charts`,
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

    it('Should get forbidden error (403) from GET Scheduler logs', () => {
        cy.request({
            url: `${apiUrl}/schedulers/${SEED_PROJECT.project_uuid}/logs`,
            failOnStatusCode: false,
        }).then((resp) => {
            expect(resp.status).to.eq(403);
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

    it('Should get forbidden (403) from PUT explores', () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        const endpoint = `/projects/${projectUuid}/explores`;
        cy.request({
            url: `${apiUrl}${endpoint}`,
            headers: { 'Content-type': 'application/json' },
            method: 'PUT',
            body: [],
            failOnStatusCode: false,
        }).then((resp) => {
            expect(resp.status).to.eq(403);
        });
    });

    it('Should get forbidden (403) from POST runQuery', () => {
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
    it('Should get csv (200) from POST downloadCsv', () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        const endpoint = `/projects/${projectUuid}/explores/customers/downloadCsv`;
        cy.request({
            url: `${apiUrl}${endpoint}`,
            headers: { 'Content-type': 'application/json' },
            method: 'POST',
            body: {
                ...runqueryBody,
                onlyRaw: false,
                columnOrder: [],
                showTableNames: false,
            },
            failOnStatusCode: false,
        }).then((resp) => {
            expect(resp.status).to.eq(200);
        });
    });
    it('Should get forbidden (403) from POST runUnderlyingDataQuery', () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        const endpoint = `/projects/${projectUuid}/explores/customers/runUnderlyingDataQuery`;
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

    it('Should get success response (200) from POST chart results', () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        // Fetch a chart from spaces
        cy.request(`${apiUrl}/projects/${projectUuid}/charts`).then(
            (spacesResponse) => {
                const savedChartUuid = spacesResponse.body.results[0].uuid;
                const endpoint = `/saved/${savedChartUuid}/results`;
                cy.request({
                    url: `${apiUrl}${endpoint}`,
                    headers: { 'Content-type': 'application/json' },
                    method: 'POST',
                    body: undefined,
                }).then((resp) => {
                    expect(resp.status).to.eq(200);
                    expect(resp.body).to.have.property('status', 'ok');
                });
            },
        );
    });

    it('Should get success response (200) from POST chart-and-results with filters', () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        // Fetch a chart from spaces
        cy.request(`${apiUrl}/projects/${projectUuid}/charts`).then(
            (spacesResponse) => {
                const savedChartUuid = spacesResponse.body.results[0].uuid;
                const endpoint = `/saved/${savedChartUuid}/chart-and-results`;
                cy.request({
                    url: `${apiUrl}${endpoint}`,
                    headers: { 'Content-type': 'application/json' },
                    method: 'POST',
                    body: {
                        dashboardUuid: 'example',
                        dashboardFilters: {
                            metrics: [],
                            dimensions: [],
                            tableCalculations: [],
                        },
                        dashboardSorts: [],
                    },
                }).then((resp) => {
                    expect(resp.status).to.eq(200);
                    expect(resp.body).to.have.property('status', 'ok');
                });
            },
        );
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

    it('Should get a forbidden (403) from PATCH dashboard', () => {
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
                        filters: {
                            dimensions: [],
                            metrics: [],
                            tableCalculations: [],
                        },
                        tabs: [],
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

    before(() => {
        cy.loginWithPermissions('member', []).then((e) => {
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

    it('Should get forbidden error (403) from project endpoints', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoints = [
            `/projects/${projectUuid}`,
            `/projects/${projectUuid}/explores`,
            `/projects/${projectUuid}/spaces`,
            `/projects/${projectUuid}/catalog`,
            `/projects/${projectUuid}/tablesConfiguration`,
            `/projects/${projectUuid}/hasSavedCharts`,
            `/schedulers/${projectUuid}/logs`,
        ];

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
        const projectUuid = SEED_PROJECT.project_uuid;
        cy.request(`${apiUrl}/projects/${projectUuid}/dashboards`).then(
            (resp) => {
                expect(resp.status).to.eq(200);
                expect(resp.body).to.have.property('status', 'ok');

                expect(resp.body.results).to.have.length(0);
            },
        );
    });

    it('Should get forbidden (403) from PUT explores', () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        const endpoint = `/projects/${projectUuid}/explores`;
        cy.request({
            url: `${apiUrl}${endpoint}`,
            headers: { 'Content-type': 'application/json' },
            method: 'PUT',
            body: [],
            failOnStatusCode: false,
        }).then((resp) => {
            expect(resp.status).to.eq(403);
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

describe('Lightdash API tests for project members access', () => {
    beforeEach(() => {
        cy.login();
    });
    it('Should get project members access', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        cy.request(`${apiUrl}/projects/${projectUuid}/access`).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body.results).to.not.have.length(0);
            (resp.body.results as ProjectMemberProfile[]).forEach((member) => {
                cy.request(
                    `${apiUrl}/projects/${projectUuid}/user/${member.userUuid}`,
                ).then((resp2) => {
                    expect(resp2.status).to.eq(200);
                    expect(resp2.body.results.userUuid).eq(member.userUuid);
                    expect(resp2.body.results.projectUuid).eq(
                        member.projectUuid,
                    );
                    expect(resp2.body.results.role).eq(member.role);
                });
            });
        });
    });
    it('Should not get project member access for user that gets access via the org role', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        cy.request({
            url: `${apiUrl}/projects/${projectUuid}/user/${SEED_ORG_1_ADMIN.user_uuid}`,
            method: 'GET',
            failOnStatusCode: false,
        }).then((resp) => {
            expect(resp.status).to.eq(404);
        });
    });
});
