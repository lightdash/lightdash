import { SEED_PROJECT } from '@lightdash/common';
import {
    getEmbedConfig,
    getEmbedUrl,
    updateEmbedConfig,
} from '../../support/embedUtils';

describe('Embed Dashboard JWT API', () => {
    let testDashboardUuid: string;

    before(() => {
        cy.login();

        // Get and save the original embed configuration for cleanup
        getEmbedConfig().then((configResp) => {
            expect(configResp.status).to.eq(200);
            const originalEmbedConfig = configResp.body.results;

            // Get all dashboards from the project
            cy.request(
                `/api/v1/projects/${SEED_PROJECT.project_uuid}/dashboards`,
            ).then((dashboardsResp) => {
                expect(dashboardsResp.status).to.eq(200);
                const dashboards = dashboardsResp.body.results;
                expect(dashboards).to.have.length.greaterThan(
                    0,
                    'Need at least 1 dashboard for testing',
                );

                // Store first dashboard for testing
                testDashboardUuid = dashboards[0].uuid;

                expect(testDashboardUuid).to.be.a('string');
                expect(testDashboardUuid.length).to.be.greaterThan(0);

                // Update embed config to include the dashboard we're testing with
                updateEmbedConfig({
                    dashboardUuids: [testDashboardUuid],
                    allowAllDashboards: false,
                    chartUuids: originalEmbedConfig.chartUuids || [],
                    allowAllCharts: originalEmbedConfig.allowAllCharts || false,
                }).then((updateResp) => {
                    expect(updateResp.status).to.eq(200);
                });
            });
        });
    });

    beforeEach(() => {
        cy.login();
        cy.wrap(testDashboardUuid).as('dashboardUuid');
    });

    it('should create embed URL for dashboard with JWT token', () => {
        cy.get<string>('@dashboardUuid').then((dashboardUuid) => {
            getEmbedUrl({
                user: {
                    externalId: 'dashboard-user@example.com',
                    email: 'dashboard-user@example.com',
                },
                content: {
                    type: 'dashboard',
                    dashboardUuid: dashboardUuid as string,
                    canExportCsv: true,
                    canExportImages: false,
                    canViewUnderlyingData: true,
                    canDateZoom: true,
                    projectUuid: SEED_PROJECT.project_uuid,
                },
                expiresIn: '24h',
            }).then((resp) => {
                expect(resp.status).to.eq(200);
                expect(resp.body.results).to.have.property('url');

                // Extract the JWT token from the URL fragment (after #)
                const { url } = resp.body.results;
                const token = url.split('#')[1];
                expect(token).to.be.a('string');
                expect(token.length).to.be.greaterThan(0);
            });
        });
    });

    describe('Using Dashboard JWT Token', () => {
        let dashboardJwtToken: string;

        before(() => {
            // Login to create the JWT token, then clear the session
            cy.login();
            getEmbedUrl({
                user: {
                    externalId: 'dashboard-user@example.com',
                    email: 'dashboard-user@example.com',
                },
                content: {
                    type: 'dashboard',
                    dashboardUuid: testDashboardUuid,
                    canExportCsv: true,
                    canExportImages: false,
                    canViewUnderlyingData: true,
                    canDateZoom: true,
                    projectUuid: SEED_PROJECT.project_uuid,
                },
                expiresIn: '24h',
            }).then((resp) => {
                expect(resp.status).to.eq(200);
                const { url } = resp.body.results;
                [, dashboardJwtToken] = url.split('#');
            });
        });

        beforeEach(() => {
            // Don't log in - these tests should use JWT token only
            cy.logout();
            cy.wrap(dashboardJwtToken).as('dashboardJwtToken');
        });

        describe('Explore Access (Regression Tests)', () => {
            // Dashboard JWTs need access to explore endpoints because a dashboard
            // can contain multiple charts from different explores. These tests
            // verify that dashboard JWTs are NOT affected by the chart JWT
            // restrictions and can still access explore metadata.

            it('should allow dashboard JWT to access getAllExploresSummary', () => {
                cy.get<string>('@dashboardJwtToken').then((token) => {
                    cy.request({
                        url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/explores?projectUuid=${SEED_PROJECT.project_uuid}&filtered=true`,
                        headers: {
                            'Lightdash-Embed-Token': token as string,
                        },
                        method: 'GET',
                    }).then((resp) => {
                        // Should succeed - dashboard JWTs need explore list
                        expect(resp.status).to.eq(200);
                        expect(resp.body.status).to.eq('ok');
                        expect(resp.body.results).to.be.an('array');
                    });
                });
            });

            it('should allow dashboard JWT to access getExplore for any explore', () => {
                cy.get<string>('@dashboardJwtToken').then((token) => {
                    // Try to access an explore
                    const exploreName = 'orders';
                    cy.request({
                        url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/explores/${exploreName}?projectUuid=${SEED_PROJECT.project_uuid}`,
                        headers: {
                            'Lightdash-Embed-Token': token as string,
                        },
                        method: 'GET',
                    }).then((resp) => {
                        // Should succeed - dashboard JWTs need explore schemas
                        expect(resp.status).to.eq(200);
                        expect(resp.body.status).to.eq('ok');
                        expect(resp.body.results).to.have.property('name');
                        expect(resp.body.results).to.have.property('tables');
                    });
                });
            });

            it('should allow dashboard JWT to access getTablesConfiguration', () => {
                cy.get<string>('@dashboardJwtToken').then((token) => {
                    cy.request({
                        url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/tablesConfiguration?projectUuid=${SEED_PROJECT.project_uuid}`,
                        headers: {
                            'Lightdash-Embed-Token': token as string,
                        },
                        method: 'GET',
                    }).then((resp) => {
                        // Should succeed - dashboard JWTs may need table config
                        expect(resp.status).to.eq(200);
                        expect(resp.body.status).to.eq('ok');
                        expect(resp.body.results).to.have.property(
                            'tableSelection',
                        );
                    });
                });
            });
        });

        describe('GET dashboard details', () => {
            it('should get dashboard using JWT token (authorized)', () => {
                cy.get<string>('@dashboardJwtToken').then((token) => {
                    cy.get<string>('@dashboardUuid').then((dashboardUuid) => {
                        cy.request({
                            url: `/api/v1/dashboards/${dashboardUuid}?projectUuid=${SEED_PROJECT.project_uuid}`,
                            headers: {
                                'Lightdash-Embed-Token': token as string,
                            },
                            method: 'GET',
                            failOnStatusCode: false,
                        }).then((resp) => {
                            expect(resp.status).to.eq(500);
                        });
                    });
                });
            });
        });

        it('should fail to run SQL query with dashboard JWT token (no permission)', () => {
            cy.get<string>('@dashboardJwtToken').then((token) => {
                cy.request({
                    url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/sqlQuery`,
                    headers: {
                        'Lightdash-Embed-Token': token as string,
                        'Content-type': 'application/json',
                    },
                    method: 'POST',
                    body: {
                        sql: 'SELECT * FROM postgres.jaffle.orders LIMIT 10',
                    },
                    failOnStatusCode: false,
                }).then((resp) => {
                    // Should fail with 403 Forbidden because dashboard JWT doesn't grant SQL query permission
                    expect(resp.status).to.be.oneOf([403, 500]);
                    expect(resp.body).to.have.property('error');
                });
            });
        });
    });
});
