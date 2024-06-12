import { SEED_PROJECT } from '@lightdash/common';
import { chartMock } from './dashboard.cy';

const apiUrl = '/api/v1';

const checkPromotedChart = (promotedChart, upstreamChart) => {
    cy.log(`Checking promoted chart ${promotedChart}`);
    // Slug, metricQuery and chartConfig are not returend on /charts so we can't compare
    const equalProperties = ['name', 'spaceName', 'organizationUuid'];
    equalProperties.forEach((prop) => {
        expect(promotedChart[prop], `property ${prop}`).to.eq(
            upstreamChart[prop],
        );
    });

    const notEqualProperties = ['uuid', 'projectUuid', 'spaceUuid'];
    notEqualProperties.forEach((prop) => {
        expect(promotedChart[prop], `property ${prop}`).to.not.eq(
            upstreamChart[prop],
        );
    });
};
describe('Promotion charts', () => {
    const upstreamProjectName = `Upstream project ${Date.now()}`;
    let upstreamProjectUuid: string;
    beforeEach(() => {
        cy.login();
    });
    before('create upstream project', () => {
        cy.login();

        cy.createProject(upstreamProjectName).then((projectUuid) => {
            upstreamProjectUuid = projectUuid;
        });
    });

    after('delete upstream project', () => {
        cy.log(`Deleting project by name ${upstreamProjectName}`);
        cy.deleteProjectsByName([upstreamProjectName]);
        // After deleting upstream project, the seed project upstreamProjectUuid should be undefined
    });

    it('Set upstream project on seed project', () => {
        cy.request({
            url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/metadata`,
            headers: { 'Content-type': 'application/json' },
            method: 'PATCH',
            body: {
                upstreamProjectUuid: upstreamProjectUuid,
            },
        }).then((resp) => {
            expect(resp.status).to.eq(200);
        });
    });

    it('Promote existing chart in space', () => {
        cy.request({
            url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/charts`,
            method: 'GET',
        }).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body.results).to.have.length.greaterThan(0);
            const chart = resp.body.results.find(
                (c) => c.name === 'How many orders we have over time ?',
            );

            cy.request({
                url: `${apiUrl}/saved/${chart.uuid}/promote`,
                method: 'POST',
            }).then((promoteResponse) => {
                expect(promoteResponse.status).to.eq(200);
                const upstreamChart = promoteResponse.body.results;

                checkPromotedChart(chart, upstreamChart);

                // Promote again
                cy.request({
                    url: `${apiUrl}/saved/${chart.uuid}/promote`,
                    method: 'POST',
                }).then((pr) => {
                    expect(pr.status).to.eq(200);
                });
            });
        });
    });

    it('Promote new chart in new space', () => {
        cy.createSpace(
            SEED_PROJECT.project_uuid,
            `Public space ${Date.now()}`,
        ).then((spaceUuid) => {
            cy.createChartInSpace(SEED_PROJECT.project_uuid, {
                metricQuery: chartMock.metricQuery,
                chartConfig: chartMock.chartConfig,
                tableConfig: chartMock.tableConfig,
                name: `chart in space ${spaceUuid}`,
                tableName: '',
                spaceUuid,
                dashboardUuid: null,
            }).then((chart) => {
                cy.request({
                    url: `${apiUrl}/saved/${chart.uuid}/promote`,
                    method: 'POST',
                }).then((promoteResponse) => {
                    expect(promoteResponse.status).to.eq(200);
                    const upstreamChart = promoteResponse.body.results;

                    checkPromotedChart(chart, upstreamChart);
                    // Promote again
                    cy.request({
                        url: `${apiUrl}/saved/${chart.uuid}/promote`,
                        method: 'POST',
                    }).then((pr) => {
                        expect(pr.status).to.eq(200);
                    });
                });
            });
        });
    });
});
