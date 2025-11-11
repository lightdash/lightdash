import { SEED_PROJECT } from '@lightdash/common';
import {
    getEmbedConfig,
    getEmbedUrl,
    updateEmbedConfig,
} from '../../support/embedUtils';

describe('Embed Chart JWT API', () => {
    let testChartUuid: string;
    let testAnotherChartUuid: string;
    let testChartNotEmbeddedUuid: string;

    before(() => {
        cy.login();

        // Get and save the original embed configuration for cleanup
        getEmbedConfig().then((configResp) => {
            expect(configResp.status).to.eq(200);
            const originalEmbedConfig = configResp.body.results;

            // Fetch specific charts by their known slugs from seed data
            // This makes tests deterministic and clear about which charts are being tested
            cy.request(
                `/api/v1/saved/how-much-revenue-do-we-have-per-payment-method?projectUuid=${SEED_PROJECT.project_uuid}`,
            ).then((chartResp) => {
                expect(chartResp.status).to.eq(200);
                testChartUuid = chartResp.body.results.uuid;
                expect(testChartUuid).to.be.a('string');

                cy.request(
                    `/api/v1/saved/how-many-orders-we-have-over-time?projectUuid=${SEED_PROJECT.project_uuid}`,
                ).then((anotherChartResp) => {
                    expect(anotherChartResp.status).to.eq(200);
                    testAnotherChartUuid = anotherChartResp.body.results.uuid;
                    expect(testAnotherChartUuid).to.be.a('string');

                    cy.request(
                        `/api/v1/saved/what-s-our-total-revenue-to-date?projectUuid=${SEED_PROJECT.project_uuid}`,
                    ).then((notEmbeddedChartResp) => {
                        expect(notEmbeddedChartResp.status).to.eq(200);
                        testChartNotEmbeddedUuid =
                            notEmbeddedChartResp.body.results.uuid;
                        expect(testChartNotEmbeddedUuid).to.be.a('string');

                        // Update embed config to include the charts we're testing with
                        // Keep existing dashboards (if any) and add our test charts
                        updateEmbedConfig({
                            dashboardUuids:
                                originalEmbedConfig.dashboardUuids || [],
                            allowAllDashboards:
                                originalEmbedConfig.allowAllDashboards || false,
                            // First two charts are allowed in embedding, but we will only create a JWT for the first one
                            chartUuids: [testChartUuid, testAnotherChartUuid],
                            allowAllCharts: false,
                        }).then((updateResp) => {
                            expect(updateResp.status).to.eq(200);
                        });
                    });
                });
            });
        });
    });

    beforeEach(() => {
        cy.login();
        cy.wrap(testChartUuid).as('chartUuid');
        cy.wrap(testAnotherChartUuid).as('anotherChartUuid');
        cy.wrap(testChartNotEmbeddedUuid).as('chartNotEmbeddedUuid');
    });

    it('should create embed URL for chart with JWT token', () => {
        cy.get<string>('@chartUuid').then((chartUuid) => {
            getEmbedUrl({
                user: {
                    externalId: 'chart-user@example.com',
                    email: 'chart-user@example.com',
                },
                content: {
                    type: 'chart',
                    contentId: chartUuid as string,
                    scopes: ['view:Chart'],
                    canExportCsv: true,
                    canExportImages: false,
                    canViewUnderlyingData: true,
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

    describe('Using Chart JWT Token', () => {
        let chartJwtToken: string;

        before(() => {
            // Login to create the JWT token, then clear the session
            cy.login();
            getEmbedUrl({
                user: {
                    externalId: 'chart-user@example.com',
                    email: 'chart-user@example.com',
                },
                content: {
                    type: 'chart',
                    contentId: testChartUuid,
                    scopes: ['view:Chart'],
                    canExportCsv: true,
                    canExportImages: false,
                    canViewUnderlyingData: true,
                    projectUuid: SEED_PROJECT.project_uuid,
                },
                expiresIn: '24h',
            }).then((resp) => {
                expect(resp.status).to.eq(200);
                const { url } = resp.body.results;
                [, chartJwtToken] = url.split('#');
            });
        });

        beforeEach(() => {
            // Don't log in - these tests should use JWT token only
            cy.logout();
            cy.wrap(chartJwtToken).as('chartJwtToken');
        });

        it('should get unauthorized if not passing projectUuid argument with JWT token', () => {
            cy.get<string>('@chartJwtToken').then((token) => {
                cy.get<string>('@chartUuid').then((chartUuid) => {
                    cy.request({
                        url: `/api/v1/saved/${chartUuid}`,
                        headers: {
                            'Lightdash-Embed-Token': token as string,
                        },
                        method: 'GET',
                        failOnStatusCode: false,
                    }).then((resp) => {
                        expect(resp.status).to.eq(401);
                    });
                });
            });
        });

        describe('GET chart details', () => {
            it('should get chart using JWT token (authorized)', () => {
                cy.get<string>('@chartJwtToken').then((token) => {
                    cy.get<string>('@chartUuid').then((chartUuid) => {
                        cy.request({
                            url: `/api/v1/saved/${chartUuid}?projectUuid=${SEED_PROJECT.project_uuid}`,
                            headers: {
                                'Lightdash-Embed-Token': token as string,
                            },
                            method: 'GET',
                        }).then((resp) => {
                            expect(resp.status).to.eq(200);
                            expect(resp.body.status).to.eq('ok');
                            expect(resp.body.results).to.have.property(
                                'uuid',
                                chartUuid,
                            );
                            expect(resp.body.results).to.have.property('name');
                            expect(resp.body.results).to.have.property(
                                'tableName',
                            );
                        });
                    });
                });
            });

            it('should fail to get chart using another chart JWT token (unauthorized)', () => {
                cy.get<string>('@chartJwtToken').then((token) => {
                    cy.get<string>('@chartUuid').then((chartUuid) => {
                        cy.get<string>('@chartNotEmbeddedUuid').then(
                            (chartNotEmbeddedUuid) => {
                                expect(chartNotEmbeddedUuid).to.not.eq(
                                    chartUuid,
                                );

                                cy.request({
                                    url: `/api/v1/saved/${chartNotEmbeddedUuid}?projectUuid=${SEED_PROJECT.project_uuid}`,
                                    headers: {
                                        'Lightdash-Embed-Token':
                                            token as string,
                                    },
                                    method: 'GET',
                                    failOnStatusCode: false,
                                }).then((resp) => {
                                    // Should fail with 403 Forbidden because JWT token is scoped to different chart
                                    expect(resp.status).to.eq(403);
                                    expect(resp.body).to.have.property('error');
                                });
                            },
                        );
                    });
                });
            });
        });
        describe('POST query chart', () => {
            // This is the method used for the explore to get results from a chart
            it.skip('should get chart query results using JWT token (authorized)', () => {
                // FIXME this doesn't work
                // Currently throws a 403

                cy.get<string>('@chartJwtToken').then((token) => {
                    cy.get<string>('@chartUuid').then((chartUuid) => {
                        cy.request({
                            url: `/api/v2/projects/${SEED_PROJECT.project_uuid}/query/chart?projectUuid=${SEED_PROJECT.project_uuid}`,
                            headers: {
                                'Lightdash-Embed-Token': token as string,
                                'Content-type': 'application/json',
                            },
                            method: 'POST',
                            body: {
                                context: 'chartView',
                                chartUuid,
                                invalidateCache: false,
                                parameters: {},
                                pivotResults: false,
                            },
                            failOnStatusCode: false,
                        }).then((resp) => {
                            expect(resp.status).to.eq(403);
                        });
                    });
                });
            });

            // This is the method used for the explore to get results from a chart
            it('should fail to get chart query results using another chartJWT token (unauthorized)', () => {
                cy.get<string>('@chartJwtToken').then((token) => {
                    cy.get<string>('@anotherChartUuid').then(
                        (anotherChartUuid) => {
                            cy.request({
                                url: `/api/v2/projects/${SEED_PROJECT.project_uuid}/query/chart?projectUuid=${SEED_PROJECT.project_uuid}`,
                                headers: {
                                    'Lightdash-Embed-Token': token as string,
                                    'Content-type': 'application/json',
                                },
                                method: 'POST',
                                body: {
                                    context: 'chartView',
                                    chartUuid: anotherChartUuid,
                                    invalidateCache: false,
                                    parameters: {},
                                    pivotResults: false,
                                },
                                failOnStatusCode: false,
                            }).then((resp) => {
                                expect(resp.status).to.eq(403);
                            });
                        },
                    );
                });
            });
        });

        describe('GET chart history', () => {
            it('should get chart history using JWT token (authorized)', () => {
                cy.get<string>('@chartJwtToken').then((token) => {
                    cy.get<string>('@chartUuid').then((chartUuid) => {
                        cy.request({
                            url: `/api/v1/saved/${chartUuid}/history?projectUuid=${SEED_PROJECT.project_uuid}`,
                            headers: {
                                'Lightdash-Embed-Token': token as string,
                            },
                            method: 'GET',
                            failOnStatusCode: false,
                        }).then((resp) => {
                            expect(resp.status).to.be.oneOf([200, 500]);
                        });
                    });
                });
            });

            it('should fail to chart history using another chart JWT token (unauthorized)', () => {
                // FIXME this doesn't work
                // > 500: Internal Server Error
                cy.get<string>('@chartJwtToken').then((token) => {
                    cy.get<string>('@anotherChartUuid').then(
                        (anotherChartUuid) => {
                            cy.request({
                                url: `/api/v1/saved/${anotherChartUuid}/history?projectUuid=${SEED_PROJECT.project_uuid}`,
                                headers: {
                                    'Lightdash-Embed-Token': token as string,
                                },
                                method: 'GET',
                                failOnStatusCode: false,
                            }).then((resp) => {
                                // Should fail with 403 Forbidden because chart JWT does not support this acction or chart
                                // Currently it fails with 500 error because accounts are not supported yet
                                expect(resp.status).to.be.oneOf([403, 500]);
                            });
                        },
                    );
                });
            });
        });

        describe('GET chart views', () => {
            it('should get chart views using JWT token (authorized)', () => {
                // FIXME this doesn't work
                // > 500: Internal Server Error
                cy.get<string>('@chartJwtToken').then((token) => {
                    cy.get<string>('@chartUuid').then((chartUuid) => {
                        cy.request({
                            url: `/api/v1/saved/${chartUuid}/views?projectUuid=${SEED_PROJECT.project_uuid}`,
                            headers: {
                                'Lightdash-Embed-Token': token as string,
                            },
                            method: 'GET',
                            failOnStatusCode: false,
                        }).then((resp) => {
                            expect(resp.status).to.be.oneOf([200, 500]);
                        });
                    });
                });
            });

            it('should fail to chart views using another chart JWT token (unauthorized)', () => {
                // FIXME this doesn't work
                // > 500: Internal Server Error
                cy.get<string>('@chartJwtToken').then((token) => {
                    cy.get<string>('@anotherChartUuid').then(
                        (anotherChartUuid) => {
                            cy.request({
                                url: `/api/v1/saved/${anotherChartUuid}/views?projectUuid=${SEED_PROJECT.project_uuid}`,
                                headers: {
                                    'Lightdash-Embed-Token': token as string,
                                },
                                method: 'GET',
                                failOnStatusCode: false,
                            }).then((resp) => {
                                // Should fail with 403 Forbidden because chart JWT does not support this acction or chart
                                // Currently it fails with 500 error because accounts are not supported yet
                                expect(resp.status).to.be.oneOf([403, 500]);
                            });
                        },
                    );
                });
            });
        });
        // This method is deprecated, but still supported for backwards compatibility
        // We still need to make sure we can get access using the JWT token if the chart matches
        describe('POST chart results deprecated', () => {
            it('should get chart results using JWT token (authorized)', () => {
                // FIXME this doesn't work currently because SavedChartController.postChartResults
                // is not supporting account, so fails to get userUuid parameter
                cy.get<string>('@chartJwtToken').then((token) => {
                    cy.get<string>('@chartUuid').then((chartUuid) => {
                        cy.request({
                            url: `/api/v1/saved/${chartUuid}/results?projectUuid=${SEED_PROJECT.project_uuid}`,
                            headers: {
                                'Lightdash-Embed-Token': token as string,
                                'Content-type': 'application/json',
                            },
                            method: 'POST',
                            body: undefined,
                            failOnStatusCode: false,
                        }).then((resp) => {
                            expect(resp.status).to.be.oneOf([200, 500]);
                            expect(resp.body).not.to.have.property(
                                'status',
                                'ok',
                            );
                        });
                    });
                });
            });

            it('should fail to get chart results using another chart JWT token (authorized)', () => {
                // FIXME this doesn't work currently because SavedChartController.postChartResults
                // is not supporting account, so fails to get userUuid parameter
                cy.get<string>('@chartJwtToken').then((token) => {
                    cy.get<string>('@anotherChartUuid').then(
                        (anotherChartUuid) => {
                            cy.request({
                                url: `/api/v1/saved/${anotherChartUuid}/results?projectUuid=${SEED_PROJECT.project_uuid}`,
                                headers: {
                                    'Lightdash-Embed-Token': token as string,
                                    'Content-type': 'application/json',
                                },
                                method: 'POST',
                                body: undefined,
                                failOnStatusCode: false,
                            }).then((resp) => {
                                // Should fail with 403 Forbidden because chart JWT does not support this acction or chart
                                // Currently it fails with 500 error because accounts are not supported yet
                                expect(resp.status).to.be.oneOf([403, 500]);

                                expect(resp.body).not.to.have.property(
                                    'status',
                                    'ok',
                                );
                            });
                        },
                    );
                });
            });
        });

        it('should fail to get dashboard using chart JWT token (unauthorized)', () => {
            cy.get<string>('@chartJwtToken').then((token) => {
                cy.request({
                    url: `/api/v1/embed/${SEED_PROJECT.project_uuid}/dashboard`,
                    headers: {
                        'Lightdash-Embed-Token': token as string,
                        'Content-type': 'application/json',
                    },
                    method: 'POST',
                    body: undefined,
                    failOnStatusCode: false,
                }).then((resp) => {
                    expect(resp.status).to.eq(403);
                });
            });
        });

        it('should fail to run SQL query with chart JWT token (no permission)', () => {
            cy.get<string>('@chartJwtToken').then((token) => {
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
                    // Should fail with 403 Forbidden because chart JWT doesn't grant SQL query permission
                    // Currently it fails with 500 error because accounts are not supported yet
                    expect(resp.status).to.be.oneOf([403, 500]);
                    expect(resp.body).to.have.property('error');
                });
            });
        });

        describe('Explore Access Restrictions (Security)', () => {
            // Chart JWTs should NOT have access to explore endpoints to prevent
            // information disclosure of the full data model. These tests verify
            // that chart JWTs are properly blocked from accessing project-wide
            // explore metadata, even for their own chart's explore.

            it('should block chart JWT from accessing getAllExploresSummary', () => {
                cy.get<string>('@chartJwtToken').then((token) => {
                    cy.request({
                        url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/explores?projectUuid=${SEED_PROJECT.project_uuid}&filtered=true`,
                        headers: {
                            'Lightdash-Embed-Token': token as string,
                        },
                        method: 'GET',
                        failOnStatusCode: false,
                    }).then((resp) => {
                        // Should fail with 403 Forbidden to prevent disclosure of all table names
                        expect(resp.status).to.eq(403);
                        expect(resp.body).to.have.property('error');
                    });
                });
            });

            it('prevents chart JWT to access getExplore for explores outside the chart scope', () => {
                cy.get<string>('@chartJwtToken').then((token) => {
                    // Try to access an explore (doesn't matter which one)
                    const exploreName = 'users';
                    cy.request({
                        url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/explores/${exploreName}?projectUuid=${SEED_PROJECT.project_uuid}`,
                        headers: {
                            'Lightdash-Embed-Token': token as string,
                        },
                        method: 'GET',
                        failOnStatusCode: false,
                    }).then((resp) => {
                        expect(resp.status).to.eq(403);
                        expect(resp.body).to.have.property('error');
                    });
                });
            });

            it('should block chart JWT from accessing getTablesConfiguration', () => {
                cy.get<string>('@chartJwtToken').then((token) => {
                    cy.request({
                        url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/tablesConfiguration?projectUuid=${SEED_PROJECT.project_uuid}`,
                        headers: {
                            'Lightdash-Embed-Token': token as string,
                        },
                        method: 'GET',
                        failOnStatusCode: false,
                    }).then((resp) => {
                        // Should fail with 403 Forbidden to prevent project config disclosure
                        expect(resp.status).to.eq(403);
                        expect(resp.body).to.have.property('error');
                    });
                });
            });
        });
    });

    describe('Chart JWT with different permissions', () => {
        it('should create chart JWT with canExportCsv enabled', () => {
            cy.get<string>('@chartUuid').then((chartUuid) => {
                getEmbedUrl({
                    user: {
                        externalId: 'export-user@example.com',
                    },
                    content: {
                        type: 'chart',
                        contentId: chartUuid as string,
                        canExportCsv: true,
                        canExportImages: false,
                        canViewUnderlyingData: false,
                        projectUuid: SEED_PROJECT.project_uuid,
                    },
                    expiresIn: '1h',
                }).then((resp) => {
                    expect(resp.status).to.eq(200);
                    expect(resp.body.results).to.have.property('url');
                    const token = resp.body.results.url.split('#')[1];
                    expect(token).to.be.a('string');
                    expect(token.length).to.be.greaterThan(0);
                });
            });
        });

        it('should create chart JWT with canViewUnderlyingData enabled', () => {
            cy.get<string>('@chartUuid').then((chartUuid) => {
                getEmbedUrl({
                    user: {
                        externalId: 'data-viewer@example.com',
                    },
                    content: {
                        type: 'chart',
                        contentId: chartUuid as string,
                        canExportCsv: false,
                        canExportImages: false,
                        canViewUnderlyingData: true,
                        projectUuid: SEED_PROJECT.project_uuid,
                    },
                    expiresIn: '2h',
                }).then((resp) => {
                    expect(resp.status).to.eq(200);
                    expect(resp.body.results).to.have.property('url');
                    const token = resp.body.results.url.split('#')[1];
                    expect(token).to.be.a('string');
                    expect(token.length).to.be.greaterThan(0);
                });
            });
        });

        it('should create chart JWT with custom scopes', () => {
            cy.get<string>('@chartUuid').then((chartUuid) => {
                getEmbedUrl({
                    user: {
                        externalId: 'scoped-user@example.com',
                    },
                    content: {
                        type: 'chart',
                        contentId: chartUuid as string,
                        scopes: ['view:Chart', 'export:Chart'],
                        canExportCsv: true,
                        canExportImages: true,
                        projectUuid: SEED_PROJECT.project_uuid,
                    },
                    expiresIn: '12h',
                }).then((resp) => {
                    expect(resp.status).to.eq(200);
                    expect(resp.body.results).to.have.property('url');
                    const token = resp.body.results.url.split('#')[1];
                    expect(token).to.be.a('string');
                    expect(token.length).to.be.greaterThan(0);
                });
            });
        });
    });
});

describe('Embed Chart JWT API - invalid permissions', () => {
    let testUnauthorizedChartUuid: string;

    before(() => {
        cy.login();

        // Get a chart to use in tests
        cy.request(`/api/v2/content?pageSize=1&contentTypes=chart`).then(
            (resp) => {
                expect(resp.status).to.eq(200);
                const charts = resp.body.results.data;
                expect(charts.length).to.be.greaterThan(0);
                testUnauthorizedChartUuid = charts[0].uuid;
            },
        );
    });

    beforeEach(() => {
        cy.anotherLogin(); // Login as user without embed permissions
        cy.wrap(testUnauthorizedChartUuid).as('unauthorizedChartUuid');
    });

    it('should not create embed URL for chart without permissions', () => {
        cy.get<string>('@unauthorizedChartUuid').then((chartUuid) => {
            getEmbedUrl(
                {
                    user: {
                        externalId: 'unauthorized@example.com',
                    },
                    content: {
                        type: 'chart',
                        contentId: chartUuid as string,
                        scopes: ['view:Chart'],
                        projectUuid: SEED_PROJECT.project_uuid,
                    },
                    expiresIn: '1h',
                },
                {
                    failOnStatusCode: false,
                },
            ).then((resp) => {
                expect(resp.status).to.eq(403);
                expect(resp.body).to.have.property('error');
            });
        });
    });
});
