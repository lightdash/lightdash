/* eslint-disable @typescript-eslint/no-unused-expressions */
import {
    CreateChartInDashboard,
    CreateChartInSpace,
    Dashboard,
    SavedChart,
    SEED_PROJECT,
} from '@lightdash/common';
import { chartMock, dashboardMock } from '../../support/mocks';
import { createDashboard } from './dashboard.cy';

const apiUrl = '/api/v1';

describe('Saved chart space selection', () => {
    const chartName = 'Chart space selection test';
    const dashboardName = 'Dashboard for chart space selection test';

    before(() => {
        cy.login();
        cy.deleteChartsByName([chartName]);
        cy.deleteDashboardsByName([dashboardName]);
    });

    beforeEach(() => {
        cy.login();
    });

    after(() => {
        cy.login();
        cy.deleteChartsByName([chartName]);
        cy.deleteDashboardsByName([dashboardName]);
    });

    it('Should create a chart in the specified space', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const spaceName = `test-chart-space-${Date.now()}`;

        cy.createSpace(projectUuid, spaceName).then((spaceUuid) => {
            const body: CreateChartInSpace = {
                ...chartMock,
                name: chartName,
                spaceUuid,
                dashboardUuid: null,
            };

            cy.request<{ results: SavedChart }>({
                method: 'POST',
                url: `${apiUrl}/projects/${projectUuid}/saved`,
                body,
            }).then((response) => {
                expect(response.status).to.eq(200);
                const chart = response.body.results;

                // Fetch the chart to verify persisted state
                cy.request<{ results: SavedChart }>({
                    method: 'GET',
                    url: `${apiUrl}/saved/${chart.uuid}`,
                }).then((getResponse) => {
                    expect(getResponse.status).to.eq(200);
                    const fetchedChart = getResponse.body.results;
                    expect(fetchedChart.spaceUuid).to.eq(spaceUuid);
                    expect(fetchedChart.dashboardUuid).to.be.null;
                });
            });
        });
    });

    it('Should create a chart in the first accessible space when no spaceUuid is provided', () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        const body: CreateChartInSpace = {
            ...chartMock,
            name: chartName,
            spaceUuid: undefined,
            dashboardUuid: null,
        };

        cy.request<{ results: SavedChart }>({
            method: 'POST',
            url: `${apiUrl}/projects/${projectUuid}/saved`,
            body,
        }).then((response) => {
            expect(response.status).to.eq(200);
            const chart = response.body.results;

            // Fetch the chart to verify persisted state
            cy.request<{ results: SavedChart }>({
                method: 'GET',
                url: `${apiUrl}/saved/${chart.uuid}`,
            }).then((getResponse) => {
                expect(getResponse.status).to.eq(200);
                const fetchedChart = getResponse.body.results;
                expect(fetchedChart.spaceUuid).to.exist;
                expect(fetchedChart.spaceUuid).to.be.a('string');
                expect(fetchedChart.dashboardUuid).to.be.null;

                // Verify the space exists in the project
                cy.request<{
                    results: Array<{ uuid: string }>;
                }>(`${apiUrl}/projects/${projectUuid}/spaces`).then(
                    (spacesResponse) => {
                        const spaceUuids = spacesResponse.body.results.map(
                            (s) => s.uuid,
                        );
                        expect(spaceUuids).to.include(fetchedChart.spaceUuid);
                    },
                );
            });
        });
    });

    it('Should create a chart belonging to a dashboard', () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        createDashboard(projectUuid, {
            ...dashboardMock,
            name: dashboardName,
        }).then((dashboard: Dashboard) => {
            const body: CreateChartInDashboard = {
                ...chartMock,
                name: chartName,
                dashboardUuid: dashboard.uuid,
                spaceUuid: null,
            };

            cy.request<{ results: SavedChart }>({
                method: 'POST',
                url: `${apiUrl}/projects/${projectUuid}/saved`,
                body,
            }).then((response) => {
                expect(response.status).to.eq(200);
                const chart = response.body.results;

                // Fetch the chart to verify persisted state
                cy.request<{ results: SavedChart }>({
                    method: 'GET',
                    url: `${apiUrl}/saved/${chart.uuid}`,
                }).then((getResponse) => {
                    expect(getResponse.status).to.eq(200);
                    const fetchedChart = getResponse.body.results;
                    expect(fetchedChart.dashboardUuid).to.eq(dashboard.uuid);
                    expect(fetchedChart.spaceUuid).to.eq(dashboard.spaceUuid);
                });
            });
        });
    });
});
