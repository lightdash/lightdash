/* eslint-disable @typescript-eslint/no-unused-expressions */
import {
    CreateChartInDashboard,
    CreateChartInSpace,
    Dashboard,
    SavedChart,
    SEED_ORG_1_EDITOR,
    SEED_PROJECT,
    SpaceMemberRole,
} from '@lightdash/common';
import { chartMock, dashboardMock } from '../../support/mocks';
import {
    addSpaceUserAccess,
    createSpace,
    deleteSpaceSilent,
} from '../../support/spaceUtils';
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

describe('Saved chart cross-space dashboard permissions', () => {
    const projectUuid = SEED_PROJECT.project_uuid;
    const testPrefix = `test-cross-space-${Date.now()}`;
    const editorUserUuid = SEED_ORG_1_EDITOR.user_uuid;

    let chartSpaceUuid: string;
    let dashboardSpaceUuid: string;
    let dashboardUuid: string;

    before(() => {
        cy.login();

        // Create Space A (chart space - editor will have VIEW access)
        createSpace({
            name: `${testPrefix}-chart-space`,
            isPrivate: true,
        }).then((spaceA) => {
            chartSpaceUuid = spaceA.uuid;

            // Create Space B (dashboard space - editor will have ADMIN access)
            createSpace({
                name: `${testPrefix}-dashboard-space`,
                isPrivate: true,
            }).then((spaceB) => {
                dashboardSpaceUuid = spaceB.uuid;

                // Create dashboard in Space B
                createDashboard(projectUuid, {
                    ...dashboardMock,
                    name: `${testPrefix}-dashboard`,
                    spaceUuid: dashboardSpaceUuid,
                }).then((dashboard) => {
                    dashboardUuid = dashboard.uuid;

                    // Give editor VIEW access to chart space
                    addSpaceUserAccess(
                        chartSpaceUuid,
                        editorUserUuid,
                        SpaceMemberRole.VIEWER,
                    );
                    // Give editor ADMIN access to dashboard space
                    addSpaceUserAccess(
                        dashboardSpaceUuid,
                        editorUserUuid,
                        SpaceMemberRole.ADMIN,
                    );
                });
            });
        });
    });

    after(() => {
        cy.login();
        deleteSpaceSilent(chartSpaceUuid);
        deleteSpaceSilent(dashboardSpaceUuid);
    });

    it('Should allow saving a chart to a dashboard when user has admin access to dashboard space but only view access to chart space', () => {
        cy.loginAsEditor();

        // Send both dashboardUuid and spaceUuid (pointing to a different space)
        // This mimics the frontend behavior of "explore from here" -> save to dashboard
        // Permission should be checked against the dashboard's space, not the chart's spaceUuid
        const body = {
            ...chartMock,
            name: `${testPrefix}-chart`,
            dashboardUuid,
            spaceUuid: chartSpaceUuid,
        };

        cy.request<{ results: SavedChart }>({
            method: 'POST',
            url: `${apiUrl}/projects/${projectUuid}/saved`,
            body,
        }).then((response) => {
            expect(response.status).to.eq(200);
            const chart = response.body.results;

            expect(chart.dashboardUuid).to.eq(dashboardUuid);
            expect(chart.spaceUuid).to.eq(dashboardSpaceUuid);
        });
    });
});
