const apiUrl = '/api/v1';

describe('Slug-based API endpoints', () => {
    beforeEach(() => {
        cy.login();
    });

    describe('Dashboard API with slugs', () => {
        it('Should get dashboard by slug', () => {
            const slug = 'jaffle-dashboard';

            cy.request({
                method: 'GET',
                url: `${apiUrl}/dashboards/${slug}`,
            }).then((response) => {
                expect(response.status).to.eq(200);
                expect(response.body.status).to.eq('ok');
                expect(response.body.results.name).to.eq('Jaffle dashboard');
                expect(response.body.results.slug).to.eq(slug);
                expect(response.body.results).to.have.property('uuid');
                expect(response.body.results).to.have.property('tiles');
                expect(response.body.results).to.have.property('filters');
                expect(response.body.results.tiles).to.be.an('array');
            });
        });

        it('Should get dashboard by UUID for backward compatibility', () => {
            const slug = 'jaffle-dashboard';

            // First get the UUID
            cy.request({
                method: 'GET',
                url: `${apiUrl}/dashboards/${slug}`,
            }).then((response) => {
                const dashboardUuid = response.body.results.uuid;

                // Now request with UUID
                cy.request({
                    method: 'GET',
                    url: `${apiUrl}/dashboards/${dashboardUuid}`,
                }).then((uuidResponse) => {
                    expect(uuidResponse.status).to.eq(200);
                    expect(uuidResponse.body.results.uuid).to.eq(dashboardUuid);
                    expect(uuidResponse.body.results.slug).to.eq(slug);
                    expect(uuidResponse.body.results.name).to.eq(
                        'Jaffle dashboard',
                    );
                });
            });
        });

        it('Should return 404 for non-existent dashboard slug', () => {
            cy.request({
                method: 'GET',
                url: `${apiUrl}/dashboards/non-existent-dashboard-slug`,
                failOnStatusCode: false,
            }).then((response) => {
                expect(response.status).to.eq(404);
                expect(response.body.status).to.eq('error');
            });
        });
    });

    describe('Chart API with slugs', () => {
        it('Should get chart by slug', () => {
            const slug = 'how-much-revenue-do-we-have-per-payment-method';

            cy.request({
                method: 'GET',
                url: `${apiUrl}/saved/${slug}`,
            }).then((response) => {
                expect(response.status).to.eq(200);
                expect(response.body.status).to.eq('ok');
                expect(response.body.results.name).to.eq(
                    'How much revenue do we have per payment method?',
                );
                expect(response.body.results.slug).to.eq(slug);
                expect(response.body.results).to.have.property('uuid');
                expect(response.body.results).to.have.property('metricQuery');
                expect(response.body.results).to.have.property('chartConfig');
            });
        });

        it('Should get chart by UUID for backward compatibility', () => {
            const slug = 'how-much-revenue-do-we-have-per-payment-method';

            // First get the UUID
            cy.request({
                method: 'GET',
                url: `${apiUrl}/saved/${slug}`,
            }).then((response) => {
                const chartUuid = response.body.results.uuid;

                // Now request with UUID
                cy.request({
                    method: 'GET',
                    url: `${apiUrl}/saved/${chartUuid}`,
                }).then((uuidResponse) => {
                    expect(uuidResponse.status).to.eq(200);
                    expect(uuidResponse.body.results.uuid).to.eq(chartUuid);
                    expect(uuidResponse.body.results.slug).to.eq(slug);
                });
            });
        });

        it('Should return 404 for non-existent chart slug', () => {
            cy.request({
                method: 'GET',
                url: `${apiUrl}/saved/non-existent-chart-slug`,
                failOnStatusCode: false,
            }).then((response) => {
                expect(response.status).to.eq(404);
                expect(response.body.status).to.eq('error');
            });
        });

        it('Should get chart available filters using slug-derived UUID', () => {
            const slug = 'how-much-revenue-do-we-have-per-payment-method';

            cy.request({
                method: 'GET',
                url: `${apiUrl}/saved/${slug}`,
            }).then((response) => {
                const chartUuid = response.body.results.uuid;

                cy.request({
                    method: 'GET',
                    url: `${apiUrl}/saved/${chartUuid}/availableFilters`,
                }).then((filtersResponse) => {
                    expect(filtersResponse.status).to.eq(200);
                    expect(filtersResponse.body.status).to.eq('ok');
                    expect(
                        filtersResponse.body.results.length,
                    ).to.be.greaterThan(0);
                });
            });
        });
    });

    describe('Slug and UUID interchangeability', () => {
        it('Should work with both slug and UUID for dashboards in same session', () => {
            const slug = 'jaffle-dashboard';

            cy.request({
                method: 'GET',
                url: `${apiUrl}/dashboards/${slug}`,
            }).then((slugResponse) => {
                const { uuid } = slugResponse.body.results;

                cy.request({
                    method: 'GET',
                    url: `${apiUrl}/dashboards/${uuid}`,
                }).then((uuidResponse) => {
                    // Both should return the same dashboard
                    expect(slugResponse.body.results.name).to.equal(
                        uuidResponse.body.results.name,
                    );
                });
            });
        });

        it('Should work with both slug and UUID for charts in same session', () => {
            const slug = 'how-much-revenue-do-we-have-per-payment-method';

            cy.request({
                method: 'GET',
                url: `${apiUrl}/saved/${slug}`,
            }).then((slugResponse) => {
                const { uuid } = slugResponse.body.results;

                cy.request({
                    method: 'GET',
                    url: `${apiUrl}/saved/${uuid}`,
                }).then((uuidResponse) => {
                    // Both should return the same chart
                    expect(slugResponse.body.results).to.deep.equal(
                        uuidResponse.body.results,
                    );
                });
            });
        });
    });
});
