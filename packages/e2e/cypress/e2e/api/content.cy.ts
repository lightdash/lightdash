import { SEED_PROJECT } from '@lightdash/common';
import { chartMock } from '../../support/mocks';

const apiUrl = '/api/v2';

describe('Lightdash catalog all tables and fields', () => {
    let content: any[] = [];
    beforeEach(() => {
        cy.login();
    });

    // original API implementation and samples https://github.com/lightdash/lightdash/pull/10741
    it('Should list all content', () => {
        cy.request(`${apiUrl}/content?pageSize=999`).then((resp) => {
            expect(resp.status).to.eq(200);
            content = resp.body.results.data;
            const charts = resp.body.results.data.filter(
                (d) => d.contentType === 'chart',
            );
            const dashboards = resp.body.results.data.filter(
                (d) => d.contentType === 'dashboard',
            );

            expect(resp.body.results.data.length).to.be.greaterThan(0);
            expect(charts.length).to.be.greaterThan(0);
            expect(dashboards.length).to.be.greaterThan(0);
        });
    });
    describe('Test pagination', () => {
        it('Should pageSize', () => {
            const randomPageSize = Math.floor(Math.random() * 10 + 1);
            cy.request(`${apiUrl}/content?pageSize=${randomPageSize}`).then(
                (resp) => {
                    expect(resp.status).to.eq(200);
                    expect(resp.body.results.data.length).to.be.eq(
                        randomPageSize,
                    );
                    expect(resp.body.results.pagination.pageSize).to.be.eq(
                        randomPageSize,
                    );
                    expect(resp.body.results.pagination.page).to.be.eq(1);

                    // Content returned should be the same as the first 2 results from the `all content` response
                    const uuids = resp.body.results.data.map((d) => d.uuid);
                    expect(uuids).to.be.deep.eq(
                        content.slice(0, randomPageSize).map((d) => d.uuid),
                    );
                },
            );
        });
        it('Should second page', () => {
            cy.request(`${apiUrl}/content?pageSize=2&page=2`).then((resp) => {
                expect(resp.status).to.eq(200);
                expect(resp.body.results.data.length).to.be.eq(2);
                expect(resp.body.results.pagination.pageSize).to.be.eq(2);
                expect(resp.body.results.pagination.page).to.be.eq(2);

                // Content returned should be the same as the second 2 results from the `all content` response
                const uuids = resp.body.results.data.map((d) => d.uuid);
                expect(uuids).to.be.deep.eq(
                    content.slice(2, 4).map((d) => d.uuid),
                );
            });
        });
        it.skip('Should get page count', () => {
            cy.request(`${apiUrl}/content?pageSize=2`).then((resp) => {
                expect(resp.status).to.eq(200);
                expect(resp.body.results.pagination.totalPageCount).to.be.gt(0);
            });
        });
    });

    describe('Test order', () => {
        it('Should return charts and dashboards sorted by last_updated_at', () => {
            cy.request(`${apiUrl}/content?pageSize=999`).then((resp) => {
                expect(resp.status).to.eq(200);
                content = resp.body.results.data;
                const sortedByLastUpdated = [...content].sort(
                    (a, b) => a.lastUpdatedAt - b.lastUpdatedAt,
                );
                expect(sortedByLastUpdated.map((d) => d.uuid)).to.deep.eq(
                    content.map((d) => d.uuid),
                );

                const sortedByViews = [...content].sort(
                    (a, b) => a.views - b.views,
                );
                expect(sortedByViews.map((d) => d.uuid)).to.not.deep.eq(
                    content.map((d) => d.uuid),
                );

                // Check the list of content returns charts and dashboards mixed together
                const nextContentIsDifferent = (type: string) =>
                    content.some((d, i) => {
                        if (d.contentType === type) {
                            return content[i + 1]?.contentType !== type;
                        }
                        return false;
                    });
                expect(nextContentIsDifferent('dashboard')).to.be.eq(true);
                expect(nextContentIsDifferent('chart')).to.be.eq(true);
            });
        });
    });
    describe('Filter by spaceUuids', () => {
        it('Filter by existing spaceUuid', () => {
            cy.request(
                `${apiUrl}/content?spaceUuids=${content[0]?.space?.uuid}`,
            ).then((resp) => {
                expect(resp.status).to.eq(200);
                expect(resp.body.results.data.length).to.be.gt(0);
                // Ensure the same content uuid is returned in the response
                const uuids = resp.body.results.data.map((d) => d.uuid);
                expect(uuids).to.contain(content[0].uuid);
            });
        });
        it('Filter by existing spaceUuid', () => {
            const now = Date.now();

            cy.createSpace(
                SEED_PROJECT.project_uuid,
                `Public space to promote ${now}`,
            ).then((spaceUuid) => {
                cy.createChartInSpace(SEED_PROJECT.project_uuid, {
                    ...chartMock,
                    name: `Chart to promote ${now}`,
                    spaceUuid,
                    dashboardUuid: null,
                }).then((chart) => {
                    cy.request(
                        `${apiUrl}/content?spaceUuids=${spaceUuid}`,
                    ).then((resp) => {
                        expect(resp.status).to.eq(200);
                        expect(resp.body.results.data.length).to.be.gt(0);
                        // Ensure the new chart is returned
                        const uuids = resp.body.results.data.map((d) => d.uuid);
                        expect(uuids).to.contain(chart.uuid);

                        expect(uuids).to.not.contain(content[0].uuid); // Doesn't contain uuids from the first test
                    });
                });
            });
        });
    });

    describe('Filter by ContentTypes', () => {
        it('Should list only dashboards', () => {
            cy.request(
                `${apiUrl}/content?pageSize=999&contentTypes=dashboard`,
            ).then((resp) => {
                expect(resp.status).to.eq(200);
                const charts = resp.body.results.data.filter(
                    (d) => d.contentType === 'chart',
                );
                const dashboards = resp.body.results.data.filter(
                    (d) => d.contentType === 'dashboard',
                );

                expect(charts.length).to.be.eq(0);
                expect(dashboards.length).to.be.greaterThan(0);
            });
        });

        it('Should list only charts', () => {
            cy.request(
                `${apiUrl}/content?pageSize=999&contentTypes=chart`,
            ).then((resp) => {
                expect(resp.status).to.eq(200);
                const charts = resp.body.results.data.filter(
                    (d) => d.contentType === 'chart',
                );
                const dashboards = resp.body.results.data.filter(
                    (d) => d.contentType === 'dashboard',
                );

                expect(charts.length).to.be.greaterThan(0);
                expect(dashboards.length).to.be.eq(0);
            });
        });

        it('Should list chats and dashboards', () => {
            cy.request(
                `${apiUrl}/content?pageSize=999&contentTypes=chart&contentTypes=dashboard`,
            ).then((resp) => {
                expect(resp.status).to.eq(200);
                const charts = resp.body.results.data.filter(
                    (d) => d.contentType === 'chart',
                );
                const dashboards = resp.body.results.data.filter(
                    (d) => d.contentType === 'dashboard',
                );

                expect(charts.length).to.be.greaterThan(0);
                expect(dashboards.length).to.be.greaterThan(0);
            });
        });
    });
});

/* TODO Permission tests
- As an admin, I should see charts and dashboard from private spaces
- As a viewer, I should not see charts and dashboard I don't have access to
*/
