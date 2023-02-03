import {
    ChartScheduler,
    CreateSchedulerAndTargetsWithoutIds,
    DashboardScheduler,
    SchedulerAndTargets,
    SEED_PROJECT,
    UpdateSchedulerAndTargetsWithoutId,
} from '@lightdash/common';

const apiUrl = '/api/v1';

const createSchedulerBody: CreateSchedulerAndTargetsWithoutIds = {
    name: 'test',
    cron: '0 0 * * *',
    targets: [{ channel: 'C1' }, { channel: 'C2' }],
};

const getUpdateSchedulerBody = (
    schedulerSlackTargetUuid: string,
): UpdateSchedulerAndTargetsWithoutId => ({
    name: 'test2',
    cron: '1 0 * * *',
    targets: [{ schedulerSlackTargetUuid, channel: 'C1' }, { channel: 'C3' }],
});

describe('Lightdash pinning endpoints', () => {
    before(() => {
        cy.login();
    });
    beforeEach(() => {
        Cypress.Cookies.preserveOnce('connect.sid');
    });
    it('Should create/update/delete chart scheduler', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        cy.request(`${apiUrl}/projects/${projectUuid}/spaces`).then(
            (projectResponse) => {
                const savedChart = projectResponse.body.results[0].queries[0];

                // Create
                cy.request<{ results: SchedulerAndTargets }>({
                    url: `${apiUrl}/saved/${savedChart.uuid}/schedulers`,
                    headers: { 'Content-type': 'application/json' },
                    method: 'POST',
                    body: createSchedulerBody,
                    failOnStatusCode: false,
                }).then((createResponse) => {
                    expect(createResponse.body.results).to.have.property(
                        'schedulerUuid',
                    );
                    expect(createResponse.body.results.savedChartUuid).to.eq(
                        savedChart.uuid,
                    );
                    expect(createResponse.body.results.targets).to.have.length(
                        2,
                    );

                    const { schedulerUuid, targets } =
                        createResponse.body.results;

                    // Get all chart schedulers
                    cy.request<{ results: ChartScheduler[] }>({
                        url: `${apiUrl}/saved/${savedChart.uuid}/schedulers`,
                        method: 'GET',
                        failOnStatusCode: false,
                    }).then((response) => {
                        const schedulerIds = response.body.results.map(
                            (r) => r.schedulerUuid,
                        );
                        expect(schedulerIds).to.include(schedulerUuid);
                    });

                    // Update
                    cy.request<{ results: SchedulerAndTargets }>({
                        url: `${apiUrl}/schedulers/${schedulerUuid}`,
                        headers: { 'Content-type': 'application/json' },
                        method: 'PATCH',
                        body: getUpdateSchedulerBody(
                            targets[0].schedulerSlackTargetUuid,
                        ),
                        failOnStatusCode: false,
                    }).then((updateResponse) => {
                        expect(updateResponse.body.results.name).to.eq('test2');
                        expect(updateResponse.body.results.cron).to.eq(
                            '1 0 * * *',
                        );
                        expect(
                            updateResponse.body.results.targets,
                        ).to.have.length(2);
                        expect(
                            updateResponse.body.results.targets[0].channel,
                        ).to.eq('C1');
                        expect(
                            updateResponse.body.results.targets[1].channel,
                        ).to.eq('C3');
                    });

                    // Delete
                    cy.request({
                        url: `${apiUrl}/schedulers/${schedulerUuid}`,
                        method: 'DELETE',
                        failOnStatusCode: false,
                    }).then((deleteResponse) => {
                        expect(deleteResponse.status).to.eq(200);
                    });
                });
            },
        );
    });
    it('Should create/update/delete dashboard scheduler', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        cy.request(`${apiUrl}/projects/${projectUuid}/dashboards`).then(
            (projectResponse) => {
                const dashboard = projectResponse.body.results[0];

                cy.request<{ results: SchedulerAndTargets }>({
                    url: `${apiUrl}/dashboards/${dashboard.uuid}/schedulers`,
                    headers: { 'Content-type': 'application/json' },
                    method: 'POST',
                    body: createSchedulerBody,
                    failOnStatusCode: false,
                }).then((createResponse) => {
                    expect(createResponse.body.results).to.have.property(
                        'schedulerUuid',
                    );
                    expect(createResponse.body.results.dashboardUuid).to.eq(
                        dashboard.uuid,
                    );
                    expect(createResponse.body.results.targets).to.have.length(
                        2,
                    );

                    const { schedulerUuid, targets } =
                        createResponse.body.results;

                    // Get all dashboard schedulers
                    cy.request<{ results: DashboardScheduler[] }>({
                        url: `${apiUrl}/dashboards/${dashboard.uuid}/schedulers`,
                        method: 'GET',
                        failOnStatusCode: false,
                    }).then((response) => {
                        const schedulerIds = response.body.results.map(
                            (r) => r.schedulerUuid,
                        );
                        expect(schedulerIds).to.include(
                            createResponse.body.results.schedulerUuid,
                        );
                    });

                    // Update
                    cy.request<{ results: SchedulerAndTargets }>({
                        url: `${apiUrl}/schedulers/${schedulerUuid}`,
                        headers: { 'Content-type': 'application/json' },
                        method: 'PATCH',
                        body: getUpdateSchedulerBody(
                            targets[0].schedulerSlackTargetUuid,
                        ),
                        failOnStatusCode: false,
                    }).then((updateResponse) => {
                        expect(updateResponse.body.results.name).to.eq('test2');
                        expect(updateResponse.body.results.cron).to.eq(
                            '1 0 * * *',
                        );
                        expect(
                            updateResponse.body.results.targets,
                        ).to.have.length(2);
                        expect(
                            updateResponse.body.results.targets[0].channel,
                        ).to.eq('C1');
                        expect(
                            updateResponse.body.results.targets[1].channel,
                        ).to.eq('C3');
                    });

                    // Delete
                    cy.request({
                        url: `${apiUrl}/schedulers/${schedulerUuid}`,
                        method: 'DELETE',
                        failOnStatusCode: false,
                    }).then((deleteResponse) => {
                        expect(deleteResponse.status).to.eq(200);
                    });
                });
            },
        );
    });
});
