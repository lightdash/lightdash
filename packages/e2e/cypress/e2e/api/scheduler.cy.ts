import {
    ChartScheduler,
    CreateSchedulerAndTargetsWithoutIds,
    DashboardScheduler,
    ScheduledJobs,
    SchedulerAndTargets,
    SchedulerFormat,
    SchedulerSlackTarget,
    SEED_PROJECT,
    UpdateSchedulerAndTargetsWithoutId,
} from '@lightdash/common';

const apiUrl = '/api/v1';

const cron = '59 23 * * *';
const createSchedulerBody: CreateSchedulerAndTargetsWithoutIds = {
    name: 'test',
    cron,
    targets: [{ channel: 'C1' }, { channel: 'C2' }],
    format: SchedulerFormat.IMAGE,
    options: {},
};

const getUpdateSchedulerBody = (
    schedulerSlackTargetUuid: string,
): UpdateSchedulerAndTargetsWithoutId => ({
    name: 'test2',
    cron,
    targets: [{ schedulerSlackTargetUuid, channel: 'C1' }, { channel: 'C3' }],
    format: SchedulerFormat.IMAGE,
    options: {},
});

describe('Scheduler endpoints', () => {
    beforeEach(() => {
        cy.login();
    });
    it('Should create/update/delete chart scheduler', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        cy.request(`${apiUrl}/projects/${projectUuid}/charts`).then(
            (projectResponse) => {
                const savedChart = projectResponse.body.results.find(
                    (s) =>
                        s.name ===
                        'How much revenue do we have per payment method?',
                );

                // Create
                cy.request<{ results: SchedulerAndTargets }>({
                    url: `${apiUrl}/saved/${savedChart.uuid}/schedulers`,
                    headers: { 'Content-type': 'application/json' },
                    method: 'POST',
                    body: createSchedulerBody,
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
                    }).then((response) => {
                        const schedulerIds = response.body.results.map(
                            (r) => r.schedulerUuid,
                        );
                        expect(schedulerIds).to.include(schedulerUuid);
                    });

                    // Get created jobs
                    cy.request<{ results: ScheduledJobs[] }>({
                        url: `${apiUrl}/schedulers/${schedulerUuid}/jobs`,
                        method: 'GET',
                    }).then((response) => {
                        expect(response.body.results).to.be.length(1);
                        expect(
                            `${response.body.results[0].date}`.split('T')[1],
                        ).to.be.eq('23:59:00.000Z');
                    });

                    // Update
                    cy.request<{ results: SchedulerAndTargets }>({
                        url: `${apiUrl}/schedulers/${schedulerUuid}`,
                        headers: { 'Content-type': 'application/json' },
                        method: 'PATCH',
                        body: getUpdateSchedulerBody(
                            (targets[0] as SchedulerSlackTarget)
                                .schedulerSlackTargetUuid,
                        ),
                    }).then((updateResponse) => {
                        expect(updateResponse.body.results.name).to.eq('test2');
                        expect(updateResponse.body.results.cron).to.eq(cron);
                        expect(
                            updateResponse.body.results.targets,
                        ).to.have.length(2);
                        expect(
                            (
                                updateResponse.body.results
                                    .targets[0] as SchedulerSlackTarget
                            ).channel,
                        ).to.eq('C1');
                        expect(
                            (
                                updateResponse.body.results
                                    .targets[1] as SchedulerSlackTarget
                            ).channel,
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

                    // Jobs are deleted
                    cy.request<{ results: ScheduledJobs[] }>({
                        url: `${apiUrl}/schedulers/${schedulerUuid}/jobs`,
                        method: 'GET',
                        failOnStatusCode: false,
                    }).then((response) => {
                        expect(response.status).to.eq(404);
                    });
                });
            },
        );
    });
    it('Should create/update/delete dashboard scheduler', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        cy.request(`${apiUrl}/projects/${projectUuid}/dashboards`).then(
            (projectResponse) => {
                const dashboard = projectResponse.body.results.find(
                    (d) => d.name === 'Jaffle dashboard',
                );

                cy.request<{ results: SchedulerAndTargets }>({
                    url: `${apiUrl}/dashboards/${dashboard.uuid}/schedulers`,
                    headers: { 'Content-type': 'application/json' },
                    method: 'POST',
                    body: createSchedulerBody,
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

                    // Get created jobs
                    cy.request<{ results: ScheduledJobs[] }>({
                        url: `${apiUrl}/schedulers/${schedulerUuid}/jobs`,
                        method: 'GET',
                    }).then((response) => {
                        expect(response.body.results).to.be.length(1);
                        expect(
                            `${response.body.results[0].date}`.split('T')[1],
                        ).to.be.eq('23:59:00.000Z');
                    });

                    // Get all dashboard schedulers
                    cy.request<{ results: DashboardScheduler[] }>({
                        url: `${apiUrl}/dashboards/${dashboard.uuid}/schedulers`,
                        method: 'GET',
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
                            (targets[0] as SchedulerSlackTarget)
                                .schedulerSlackTargetUuid,
                        ),
                    }).then((updateResponse) => {
                        expect(updateResponse.body.results.name).to.eq('test2');
                        expect(updateResponse.body.results.cron).to.eq(cron);
                        expect(
                            updateResponse.body.results.targets,
                        ).to.have.length(2);
                        expect(
                            (
                                updateResponse.body.results
                                    .targets[0] as SchedulerSlackTarget
                            ).channel,
                        ).to.eq('C1');
                        expect(
                            (
                                updateResponse.body.results
                                    .targets[1] as SchedulerSlackTarget
                            ).channel,
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

                    // Jobs are deleted
                    cy.request<{ results: ScheduledJobs[] }>({
                        url: `${apiUrl}/schedulers/${schedulerUuid}/jobs`,
                        method: 'GET',
                        failOnStatusCode: false,
                    }).then((response) => {
                        expect(response.status).to.eq(404);
                    });
                });
            },
        );
    });
});
