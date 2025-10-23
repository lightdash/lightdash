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
    let embedConfig: DecodedEmbed;
    let originalConfig: DecodedEmbed;
    let beforeTestConfig: DecodedEmbed | null;

    before(() => {
        cy.login();
        // Get and save initial data for cleanup
        getEmbedConfig().then((resp) => {
            expect(resp.status).to.eq(200);
            embedConfig = resp.body.results;
            originalConfig = { ...embedConfig };
        });
    });

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

    after(() => {
        // Restore original configuration
        cy.login();
        if (originalConfig) {
            updateEmbedConfig({
                dashboardUuids: originalConfig.dashboardUuids,
                allowAllDashboards: originalConfig.allowAllDashboards,
                chartUuids: originalConfig.chartUuids,
                allowAllCharts: originalConfig.allowAllCharts,
            });
        }
    });

    it('should get project embed configuration', () => {
        expect(embedConfig).to.not.eq(null);
        expect(embedConfig.projectUuid).to.eq(SEED_PROJECT.project_uuid);
        expect(embedConfig.dashboardUuids).to.have.length.greaterThan(0);
        expect(embedConfig.createdAt).to.not.eq(null);
        expect(embedConfig.user).to.not.eq(null);
        expect(embedConfig.secret).to.not.eq(null);
        expect(embedConfig.encodedSecret).to.eq(undefined);
        expect(embedConfig.chartUuids).to.be.an('array');
        expect(embedConfig.allowAllCharts).to.be.a('boolean');
    });

    it('should replace project embed configuration with dashboards only', () => {
        replaceEmbedConfig({
            dashboardUuids: embedConfig.dashboardUuids,
        }).then((updateResp) => {
            expect(updateResp.status).to.eq(201);
            // should have new secret
            expect(updateResp.body.results.secret).to.not.eq(
                embedConfig.secret,
            );
        });
    });

    it('allows empty config to disable embeds for the project', () => {
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
            expect(resp.status).to.eq(200);
        });
    });

    it('should update project embed allowed dashboards', () => {
        cy.request(`/api/v2/content?pageSize=999&contentTypes=dashboard`).then(
            (resp) => {
                expect(resp.status).to.eq(200);
                const dashboardsUuids = resp.body.results.data.map(
                    (d: { uuid: string }) => d.uuid,
                );
                expect(dashboardsUuids).to.have.length.greaterThan(1);
                updateEmbedConfigDashboards(dashboardsUuids).then(
                    (updateResp) => {
                        expect(updateResp.status).to.eq(200);
                        getEmbedConfig().then((newConfigResp) => {
                            expect(newConfigResp.status).to.eq(200);
                        });
                    },
                );
            },
        );
    });

    it('should create embed url', () => {
        getEmbedUrl({
            content: {
                type: 'dashboard',
                dashboardUuid: embedConfig.dashboardUuids[0],
            },
        }).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body.results.url).to.not.eq(null);
        });
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
                    expect(createResp.body.results.dashboardUuids).to.be.an(
                        'array',
                    );
                });
            },
        );
    });

    it('should create embed with both dashboards and charts', () => {
        cy.request(`/api/v2/content?pageSize=999&contentTypes=chart`).then(
            (chartResp) => {
                expect(chartResp.status).to.eq(200);
                const chartUuids = chartResp.body.results.data
                    .map((c: { uuid: string }) => c.uuid)
                    .slice(0, 2);

                replaceEmbedConfig({
                    dashboardUuids: embedConfig.dashboardUuids,
                    chartUuids,
                }).then((createResp) => {
                    expect(createResp.status).to.eq(201);
                });
            },
        );
    });

    it('should update embed config with unified PATCH /config endpoint', () => {
        cy.request(`/api/v2/content?pageSize=999&contentTypes=chart`).then(
            (chartResp) => {
                expect(chartResp.status).to.eq(200);
                const chartUuids = chartResp.body.results.data
                    .map((c: { uuid: string }) => c.uuid)
                    .slice(0, 3);

                updateEmbedConfig({
                    dashboardUuids: embedConfig.dashboardUuids,
                    allowAllDashboards: false,
                    chartUuids,
                    allowAllCharts: false,
                }).then((updateResp) => {
                    expect(updateResp.status).to.eq(200);

                    // Verify the update
                    getEmbedConfig().then((newConfigResp) => {
                        expect(newConfigResp.status).to.eq(200);
                        expect(
                            newConfigResp.body.results.allowAllDashboards,
                        ).to.eq(false);
                        expect(newConfigResp.body.results.allowAllCharts).to.eq(
                            false,
                        );
                    });
                });
            },
        );
    });

    it('should update to allow all charts', () => {
        updateEmbedConfig({
            dashboardUuids: embedConfig.dashboardUuids,
            allowAllDashboards: false,
            chartUuids: [],
            allowAllCharts: true,
        }).then((updateResp) => {
            expect(updateResp.status).to.eq(200);

            getEmbedConfig().then((newConfigResp) => {
                expect(newConfigResp.status).to.eq(200);
                expect(newConfigResp.body.results.allowAllCharts).to.eq(true);
                expect(newConfigResp.body.results.chartUuids).to.be.an('array');
            });
        });
    });

    it('should update charts while keeping existing dashboards', () => {
        // Instead of getting some random charts from the api, get the charts from the jaffle dashboard
        // We know these charts will not get removed, so we don't need to worry about race conditions
        cy.request({
            method: 'GET',
            url: `/api/v1/dashboards/jaffle-dashboard`,
        }).then((response) => {
            expect(response.status).to.eq(200);
            expect(response.body.status).to.eq('ok');
            expect(response.body.results.name).to.eq('Jaffle dashboard');
            // Get 2 random charts from jaffle dashboard
            const newChartUuids = response.body.results.tiles
                .filter((tile: { type: string }) => tile.type === 'saved_chart')
                .map(
                    (tile: { properties: { savedChartUuid: string } }) =>
                        tile.properties.savedChartUuid,
                )
                .slice(0, 2);
            expect(newChartUuids).to.have.length(2);
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
                    });
                });
            });
        });
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
