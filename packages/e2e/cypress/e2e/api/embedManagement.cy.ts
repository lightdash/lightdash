import {
    CreateEmbedJwt,
    CreateEmbedRequestBody,
    DecodedEmbed,
    SEED_PROJECT,
    UpdateEmbed,
} from '@lightdash/common';

const EMBED_API_PREFIX = `/api/v1/embed/${SEED_PROJECT.project_uuid}`;

const getEmbedConfig = (requestOptions?: Partial<Cypress.RequestOptions>) =>
    cy.request({
        url: `${EMBED_API_PREFIX}/config`,
        method: 'GET',
        ...requestOptions,
    });

const replaceEmbedConfig = (
    body: CreateEmbedRequestBody,
    requestOptions?: Partial<Cypress.RequestOptions>,
) =>
    cy.request({
        url: `${EMBED_API_PREFIX}/config`,
        headers: { 'Content-type': 'application/json' },
        method: 'POST',
        body,
        ...requestOptions,
    });

/* eslint-disable-next-line import/prefer-default-export */
export const updateEmbedConfigDashboards = (
    dashboardUuids: string[],
    requestOptions?: Partial<Cypress.RequestOptions>,
) =>
    cy.request({
        url: `${EMBED_API_PREFIX}/config/dashboards`,
        headers: { 'Content-type': 'application/json' },
        method: 'PATCH',
        body: {
            dashboardUuids,
            chartUuids: [],
            allowAllDashboards: false,
            allowAllCharts: false,
        },
        ...requestOptions,
    });

const updateEmbedConfig = (
    body: UpdateEmbed,
    requestOptions?: Partial<Cypress.RequestOptions>,
) =>
    cy.request({
        url: `${EMBED_API_PREFIX}/config`,
        headers: { 'Content-type': 'application/json' },
        method: 'PATCH',
        body,
        ...requestOptions,
    });

const getEmbedUrl = (
    body: CreateEmbedJwt,
    requestOptions?: Partial<Cypress.RequestOptions>,
) =>
    cy.request({
        url: `${EMBED_API_PREFIX}/get-embed-url`,
        headers: { 'Content-type': 'application/json' },
        method: 'POST',
        body,
        ...requestOptions,
    });

describe('Embed Management API', () => {
    let beforeTestConfig: DecodedEmbed | null;

    beforeEach(() => {
        cy.login();
        // Save config state before each test for isolation
        getEmbedConfig().then((resp) => {
            if (resp.status === 200) {
                beforeTestConfig = resp.body.results;
            } else {
                beforeTestConfig = null;
            }
        });
    });

    afterEach(() => {
        // Restore config state after each test
        cy.login();
        if (beforeTestConfig) {
            updateEmbedConfig({
                dashboardUuids: beforeTestConfig.dashboardUuids,
                allowAllDashboards: beforeTestConfig.allowAllDashboards,
                chartUuids: beforeTestConfig.chartUuids,
                allowAllCharts: beforeTestConfig.allowAllCharts,
            });
        }
    });

    it('should get project embed configuration', () => {
        // Each test is independent - get current config
        getEmbedConfig().then((resp) => {
            expect(resp.status).to.eq(200);
            const config = resp.body.results;

            expect(config).to.not.eq(null);
            expect(config.projectUuid).to.eq(SEED_PROJECT.project_uuid);
            expect(config.createdAt).to.not.eq(null);
            expect(config.user).to.not.eq(null);
            expect(config.secret).to.not.eq(null);
            expect(config.encodedSecret).to.eq(undefined);
            expect(config.dashboardUuids).to.be.an('array');
            expect(config.chartUuids).to.be.an('array');
            expect(config.allowAllDashboards).to.be.a('boolean');
            expect(config.allowAllCharts).to.be.a('boolean');
        });
    });

    it('should replace project embed configuration with dashboards only', () => {
        // Fetch valid dashboards for this test
        cy.request(`/api/v2/content?pageSize=999&contentTypes=dashboard`).then(
            (dashboardsResp) => {
                expect(dashboardsResp.status).to.eq(200);
                const dashboardUuids = dashboardsResp.body.results.data.map(
                    (d: { uuid: string }) => d.uuid,
                );
                expect(dashboardUuids).to.have.length.greaterThan(
                    0,
                    'At least one dashboard should exist',
                );

                // Get current secret to verify it changes
                getEmbedConfig().then((currentConfigResp) => {
                    const currentSecret = currentConfigResp.body.results.secret;

                    replaceEmbedConfig({
                        dashboardUuids,
                    }).then((updateResp) => {
                        expect(updateResp.status).to.eq(201);
                        // should have new secret
                        expect(updateResp.body.results.secret).to.not.eq(
                            currentSecret,
                        );
                        // Verify dashboards are set (may be filtered to valid ones)
                        expect(updateResp.body.results.dashboardUuids).to.be.an(
                            'array',
                        );
                        expect(
                            updateResp.body.results.dashboardUuids.length,
                        ).to.be.greaterThan(0);
                        updateResp.body.results.dashboardUuids.forEach(
                            (uuid: string) => {
                                expect(dashboardUuids).to.include(uuid);
                            },
                        );
                        expect(updateResp.body.results.chartUuids).to.be.an(
                            'array',
                        );
                    });
                });
            },
        );
    });

    it('should fail to create embed with neither dashboards nor charts', () => {
        updateEmbedConfig(
            {
                dashboardUuids: [],
                allowAllDashboards: false,
                chartUuids: [],
                allowAllCharts: false,
            },
            {
                failOnStatusCode: false,
            },
        ).then((resp) => {
            expect(resp.status).to.eq(400);
            expect(resp.body.error.message).to.contain(
                'At least one dashboard or chart must be specified',
            );
        });
    });

    it('should update project embed allowed dashboards', () => {
        cy.request(`/api/v2/content?pageSize=999&contentTypes=dashboard`).then(
            (resp) => {
                expect(resp.status).to.eq(200);
                const dashboardsUuids = resp.body.results.data.map(
                    (d: { uuid: string }) => d.uuid,
                );
                expect(dashboardsUuids).to.have.length.greaterThan(
                    0,
                    'At least one dashboard should exist',
                );
                updateEmbedConfigDashboards(dashboardsUuids).then(
                    (updateResp) => {
                        expect(updateResp.status).to.eq(200);
                        getEmbedConfig().then((newConfigResp) => {
                            expect(newConfigResp.status).to.eq(200);
                            // Verify dashboards are set (may be filtered to valid ones)
                            expect(
                                newConfigResp.body.results.dashboardUuids,
                            ).to.be.an('array');
                            expect(
                                newConfigResp.body.results.dashboardUuids
                                    .length,
                            ).to.be.greaterThan(0);
                            newConfigResp.body.results.dashboardUuids.forEach(
                                (uuid: string) => {
                                    expect(dashboardsUuids).to.include(uuid);
                                },
                            );
                        });
                    },
                );
            },
        );
    });

    it('should create embed url', () => {
        // Fetch a valid dashboard for this test
        cy.request(`/api/v2/content?pageSize=1&contentTypes=dashboard`).then(
            (dashboardResp) => {
                expect(dashboardResp.status).to.eq(200);
                expect(
                    dashboardResp.body.results.data,
                ).to.have.length.greaterThan(
                    0,
                    'At least one dashboard should exist',
                );
                const dashboardUuid = dashboardResp.body.results.data[0].uuid;

                getEmbedUrl({
                    content: {
                        type: 'dashboard',
                        dashboardUuid,
                    },
                }).then((resp) => {
                    expect(resp.status).to.eq(200);
                    expect(resp.body.results.url).to.not.eq(null);
                });
            },
        );
    });

    it('should create embed with charts only', () => {
        cy.request(`/api/v2/content?pageSize=999&contentTypes=chart`).then(
            (resp) => {
                expect(resp.status).to.eq(200);
                const chartUuids = resp.body.results.data
                    .map((c: { uuid: string }) => c.uuid)
                    .slice(0, 2); // Take first 2 charts
                expect(chartUuids).to.have.length.greaterThan(0);

                replaceEmbedConfig({
                    chartUuids,
                }).then((createResp) => {
                    expect(createResp.status).to.eq(201);
                    // The response may filter out invalid charts, so check that we got at least one
                    // and that all returned charts are in our input list
                    expect(createResp.body.results.chartUuids).to.be.an(
                        'array',
                    );
                    expect(
                        createResp.body.results.chartUuids.length,
                    ).to.be.greaterThan(0);
                    createResp.body.results.chartUuids.forEach(
                        (chartUuid: string) => {
                            expect(chartUuids).to.include(chartUuid);
                        },
                    );
                    expect(createResp.body.results.dashboardUuids).to.be.an(
                        'array',
                    );
                });
            },
        );
    });

    it('should create embed with both dashboards and charts', () => {
        // Fetch both dashboards and charts for this test
        cy.request(`/api/v2/content?pageSize=999&contentTypes=dashboard`).then(
            (dashboardResp) => {
                expect(dashboardResp.status).to.eq(200);
                const dashboardUuids = dashboardResp.body.results.data.map(
                    (d: { uuid: string }) => d.uuid,
                );
                expect(dashboardUuids).to.have.length.greaterThan(
                    0,
                    'At least one dashboard should exist',
                );

                cy.request(
                    `/api/v2/content?pageSize=999&contentTypes=chart`,
                ).then((chartResp) => {
                    expect(chartResp.status).to.eq(200);
                    const chartUuids = chartResp.body.results.data
                        .map((c: { uuid: string }) => c.uuid)
                        .slice(0, 2);

                    expect(chartUuids).to.have.length.greaterThan(
                        0,
                        'At least one chart should be available',
                    );

                    replaceEmbedConfig({
                        dashboardUuids,
                        chartUuids,
                    }).then((createResp) => {
                        expect(createResp.status).to.eq(201);
                        // Verify dashboards are set (may be filtered to valid ones)
                        expect(createResp.body.results.dashboardUuids).to.be.an(
                            'array',
                        );
                        expect(
                            createResp.body.results.dashboardUuids.length,
                        ).to.be.greaterThan(0);
                        createResp.body.results.dashboardUuids.forEach(
                            (uuid: string) => {
                                expect(dashboardUuids).to.include(uuid);
                            },
                        );
                        // The response may filter out invalid charts, so check that we got at least one
                        // and that all returned charts are in our input list
                        expect(createResp.body.results.chartUuids).to.be.an(
                            'array',
                        );
                        expect(
                            createResp.body.results.chartUuids.length,
                        ).to.be.greaterThan(0);
                        createResp.body.results.chartUuids.forEach(
                            (chartUuid: string) => {
                                expect(chartUuids).to.include(chartUuid);
                            },
                        );
                    });
                });
            },
        );
    });

    it('should update embed config with unified PATCH /config endpoint', () => {
        // Fetch both dashboards and charts for this test
        cy.request(`/api/v2/content?pageSize=999&contentTypes=dashboard`).then(
            (dashboardResp) => {
                expect(dashboardResp.status).to.eq(200);
                const dashboardUuids = dashboardResp.body.results.data.map(
                    (d: { uuid: string }) => d.uuid,
                );
                expect(dashboardUuids).to.have.length.greaterThan(
                    0,
                    'At least one dashboard should exist',
                );

                cy.request(
                    `/api/v2/content?pageSize=999&contentTypes=chart`,
                ).then((chartResp) => {
                    expect(chartResp.status).to.eq(200);
                    const chartUuids = chartResp.body.results.data
                        .map((c: { uuid: string }) => c.uuid)
                        .slice(0, 3);

                    expect(chartUuids).to.have.length.greaterThan(
                        0,
                        'At least one chart should be available',
                    );

                    updateEmbedConfig({
                        dashboardUuids,
                        allowAllDashboards: false,
                        chartUuids,
                        allowAllCharts: false,
                    }).then((updateResp) => {
                        expect(updateResp.status).to.eq(200);

                        // Verify the update
                        getEmbedConfig().then((newConfigResp) => {
                            expect(newConfigResp.status).to.eq(200);
                            // Verify dashboards are set (may be filtered to valid ones)
                            expect(
                                newConfigResp.body.results.dashboardUuids,
                            ).to.be.an('array');
                            expect(
                                newConfigResp.body.results.dashboardUuids
                                    .length,
                            ).to.be.greaterThan(0);
                            newConfigResp.body.results.dashboardUuids.forEach(
                                (uuid: string) => {
                                    expect(dashboardUuids).to.include(uuid);
                                },
                            );
                            // The response may filter out invalid charts
                            expect(
                                newConfigResp.body.results.chartUuids,
                            ).to.be.an('array');
                            expect(
                                newConfigResp.body.results.chartUuids.length,
                            ).to.be.greaterThan(0);
                            newConfigResp.body.results.chartUuids.forEach(
                                (chartUuid: string) => {
                                    expect(chartUuids).to.include(chartUuid);
                                },
                            );
                            expect(
                                newConfigResp.body.results.allowAllDashboards,
                            ).to.eq(false);
                            expect(
                                newConfigResp.body.results.allowAllCharts,
                            ).to.eq(false);
                        });
                    });
                });
            },
        );
    });

    it('should update to allow all charts', () => {
        // Fetch valid dashboards for this test
        cy.request(`/api/v2/content?pageSize=999&contentTypes=dashboard`).then(
            (dashboardResp) => {
                expect(dashboardResp.status).to.eq(200);
                const dashboardUuids = dashboardResp.body.results.data.map(
                    (d: { uuid: string }) => d.uuid,
                );
                expect(dashboardUuids).to.have.length.greaterThan(
                    0,
                    'At least one dashboard should exist',
                );

                updateEmbedConfig({
                    dashboardUuids,
                    allowAllDashboards: false,
                    chartUuids: [],
                    allowAllCharts: true,
                }).then((updateResp) => {
                    expect(updateResp.status).to.eq(200);

                    getEmbedConfig().then((newConfigResp) => {
                        expect(newConfigResp.status).to.eq(200);
                        expect(newConfigResp.body.results.allowAllCharts).to.eq(
                            true,
                        );
                        expect(newConfigResp.body.results.chartUuids).to.be.an(
                            'array',
                        );
                    });
                });
            },
        );
    });

    it('should update charts while keeping existing dashboards', () => {
        cy.request(`/api/v2/content?pageSize=999&contentTypes=chart`).then(
            (chartResp) => {
                expect(chartResp.status).to.eq(200);
                const newChartUuids = chartResp.body.results.data
                    .map((c: { uuid: string }) => c.uuid)
                    .slice(0, 2);

                expect(newChartUuids).to.have.length.greaterThan(
                    0,
                    'At least one chart should be available',
                );

                // First, get current config
                getEmbedConfig().then((currentConfigResp) => {
                    const currentDashboards =
                        currentConfigResp.body.results.dashboardUuids;

                    // Update only charts, keeping dashboards the same
                    updateEmbedConfig({
                        dashboardUuids: currentDashboards,
                        allowAllDashboards: false,
                        chartUuids: newChartUuids,
                        allowAllCharts: false,
                    }).then((updateResp) => {
                        expect(updateResp.status).to.eq(200);

                        // Verify both dashboards and charts are correct
                        getEmbedConfig().then((verifyResp) => {
                            expect(verifyResp.status).to.eq(200);
                            // Dashboards should be unchanged (but may be filtered)
                            expect(
                                verifyResp.body.results.dashboardUuids,
                            ).to.be.an('array');
                            if (currentDashboards.length > 0) {
                                expect(
                                    verifyResp.body.results.dashboardUuids
                                        .length,
                                ).to.be.greaterThan(0);
                                verifyResp.body.results.dashboardUuids.forEach(
                                    (uuid: string) => {
                                        expect(currentDashboards).to.include(
                                            uuid,
                                        );
                                    },
                                );
                            }
                            // The response may filter out invalid charts
                            expect(verifyResp.body.results.chartUuids).to.be.an(
                                'array',
                            );
                            expect(
                                verifyResp.body.results.chartUuids.length,
                            ).to.be.greaterThan(0);
                            verifyResp.body.results.chartUuids.forEach(
                                (chartUuid: string) => {
                                    expect(newChartUuids).to.include(chartUuid);
                                },
                            );
                        });
                    });
                });
            },
        );
    });
});

describe('Embed Management API - invalid permissions', () => {
    beforeEach(() => {
        cy.anotherLogin();
    });
    it('should not get embed configuration', () => {
        getEmbedConfig({
            failOnStatusCode: false,
        }).then((resp) => {
            expect(resp.status).to.eq(403);
        });
    });
    it('should not get embed url', () => {
        getEmbedUrl(
            {
                content: {
                    type: 'dashboard',
                    dashboardUuid: 'uuid',
                },
            },
            {
                failOnStatusCode: false,
            },
        ).then((resp) => {
            expect(resp.status).to.eq(403);
        });
    });
    it('should not replace embed configuration', () => {
        replaceEmbedConfig(
            { dashboardUuids: ['uuid'] },
            {
                failOnStatusCode: false,
            },
        ).then((resp) => {
            expect(resp.status).to.eq(403);
        });
    });
    it('should not update embed configuration (dashboards endpoint)', () => {
        updateEmbedConfigDashboards(['uuid'], {
            failOnStatusCode: false,
        }).then((resp) => {
            expect(resp.status).to.eq(403);
        });
    });
    it('should not update embed configuration (unified endpoint)', () => {
        updateEmbedConfig(
            {
                dashboardUuids: ['uuid'],
                allowAllDashboards: false,
                chartUuids: ['uuid2'],
                allowAllCharts: false,
            },
            {
                failOnStatusCode: false,
            },
        ).then((resp) => {
            expect(resp.status).to.eq(403);
        });
    });
});
