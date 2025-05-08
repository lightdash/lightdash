import { AnyType, SEED_PROJECT } from '@lightdash/common';
import { chartMock } from '../../support/mocks';

const apiUrl = '/api/v2';

describe('Lightdash catalog all tables and fields', () => {
    let content: AnyType[] = [];
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

describe('Permission tests', () => {
    beforeEach(() => {
        cy.logout();
    });

    it('As an admin, I should see public and private spaces', () => {
        cy.login();
        cy.request(
            `${apiUrl}/content?contentTypes=space&projectUuids=${SEED_PROJECT.project_uuid}&page=1&pageSize=999&sortBy=last_updated_at&sortDirection=desc`,
        ).then((resp) => {
            expect(resp.status).to.eq(200);
            // Based on 05_nested_spaces.ts
            const expectedSpaceNames = [
                'Parent Space 4',
                'Parent Space 3',
                'Parent Space 2',
                'Parent Space 1',
                SEED_PROJECT.name,
            ];
            const actualSpaceNames = resp.body.results.data.map((d) => d.name);

            expect(
                expectedSpaceNames.every((name) =>
                    actualSpaceNames.includes(name),
                ),
            ).to.be.eq(true);

            const parentSpace2 = resp.body.results.data.find(
                (d) => d.name === 'Parent Space 2',
            );
            expect(parentSpace2).to.not.eq(undefined);

            cy.request(
                `${apiUrl}/content?spaceUuids=${parentSpace2?.uuid}&contentTypes=dashboard&contentTypes=chart&contentTypes=space&projectUuids=${SEED_PROJECT.project_uuid}&page=1&pageSize=999&sortBy=last_updated_at&sortDirection=desc`,
            ).then((res) => {
                expect(res.status).to.eq(200);
                expect(res.body.results.data.length).to.be.eq(1);
                expect(res.body.results.data[0].name).to.be.eq(
                    'Child Space 2.1',
                );
            });
        });
    });

    it('As an editor, I should see public spaces and private spaces that belong to me', () => {
        cy.loginAsEditor();
        cy.request(
            `${apiUrl}/content?contentTypes=space&projectUuids=${SEED_PROJECT.project_uuid}&page=1&pageSize=999&sortBy=last_updated_at&sortDirection=desc`,
        ).then((resp) => {
            expect(resp.status).to.eq(200);
            const expectedSpaceNames = [
                'Parent Space 4',
                'Parent Space 3',
                'Parent Space 1',
                SEED_PROJECT.name,
            ];
            const actualSpaceNames = resp.body.results.data.map((d) => d.name);

            expect(
                expectedSpaceNames.every((name) =>
                    actualSpaceNames.includes(name),
                ),
            ).to.be.eq(true);

            expect(actualSpaceNames.includes('Parent Space 2')).not.to.be.eq(
                true,
            );

            const parentSpace4 = resp.body.results.data.find(
                (d) => d.name === 'Parent Space 4',
            );
            expect(parentSpace4).to.not.eq(undefined);

            cy.request(
                `${apiUrl}/content?spaceUuids=${parentSpace4?.uuid}&contentTypes=dashboard&contentTypes=chart&contentTypes=space&projectUuids=${SEED_PROJECT.project_uuid}&page=1&pageSize=999&sortBy=last_updated_at&sortDirection=desc`,
            ).then((res) => {
                expect(res.status).to.eq(200);
                expect(res.body.results.data.length).to.be.eq(1);
                expect(res.body.results.data[0].name).to.be.eq(
                    'Child Space 4.1',
                );
            });
        });
    });

    it('As a viewer, I should see public spaces and private spaces that belong to me', () => {
        cy.loginAsViewer();
        cy.request(
            `${apiUrl}/content?contentTypes=space&projectUuids=${SEED_PROJECT.project_uuid}&page=1&pageSize=999&sortBy=last_updated_at&sortDirection=desc`,
        ).then((resp) => {
            expect(resp.status).to.eq(200);
            const expectedSpaceNames = ['Parent Space 1', SEED_PROJECT.name];
            const actualSpaceNames = resp.body.results.data.map((d) => d.name);

            expect(
                expectedSpaceNames.every((name) =>
                    actualSpaceNames.includes(name),
                ),
            ).to.be.eq(true);

            const parentSpace1 = resp.body.results.data.find(
                (d) => d.name === 'Parent Space 1',
            );
            expect(parentSpace1).to.not.eq(undefined);

            expect(actualSpaceNames.includes('Parent Space 2')).not.to.be.eq(
                true,
            );
            expect(actualSpaceNames.includes('Parent Space 3')).not.to.be.eq(
                true,
            );
            expect(actualSpaceNames.includes('Parent Space 4')).not.to.be.eq(
                true,
            );

            cy.request(
                `${apiUrl}/content?spaceUuids=${parentSpace1?.uuid}&contentTypes=dashboard&contentTypes=chart&contentTypes=space&projectUuids=${SEED_PROJECT.project_uuid}&page=1&pageSize=999&sortBy=last_updated_at&sortDirection=desc`,
            ).then((res) => {
                expect(res.status).to.eq(200);
                expect(res.body.results.data.length).to.be.eq(3);
                expect(
                    res.body.results.data
                        .map((d) => d.name)
                        .includes('Child Space 1.3'),
                ).to.be.eq(true);
            });
        });
    });
});
