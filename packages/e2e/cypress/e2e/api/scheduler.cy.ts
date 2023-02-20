import {
    ChartScheduler,
    CreateSchedulerAndTargetsWithoutIds,
    DashboardScheduler,
    ScheduledJobs,
    SchedulerAndTargets,
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
};

const getUpdateSchedulerBody = (
    schedulerSlackTargetUuid: string,
): UpdateSchedulerAndTargetsWithoutId => ({
    name: 'test2',
    cron,
    targets: [{ schedulerSlackTargetUuid, channel: 'C1' }, { channel: 'C3' }],
});

describe('Lightdash scheduler endpoints', () => {
    beforeEach(() => {
        cy.login();
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

                    // Get created jobs
                    cy.request<{ results: ScheduledJobs[] }>({
                        url: `${apiUrl}/schedulers/${schedulerUuid}/jobs`,
                        method: 'GET',
                        failOnStatusCode: false,
                    }).then((response) => {
                        expect(response.body.results).to.be.length(2); // 1 per channel
                        const channels = response.body.results.map(
                            (r) => r.channel,
                        );
                        expect(channels).to.have.deep.members(['C1', 'C2']);
                        expect(response.body.results[0].date).to.be.eq(
                            response.body.results[1].date,
                        );
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
                        failOnStatusCode: false,
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

                    // Get created jobs
                    cy.request<{ results: ScheduledJobs[] }>({
                        url: `${apiUrl}/schedulers/${schedulerUuid}/jobs`,
                        method: 'GET',
                        failOnStatusCode: false,
                    }).then((response) => {
                        expect(response.body.results).to.be.length(2); // 1 per channel
                        const channels = response.body.results.map(
                            (r) => r.channel,
                        );
                        expect(channels).to.have.deep.members(['C1', 'C2']);
                        expect(response.body.results[0].date).to.be.eq(
                            response.body.results[1].date,
                        );
                        expect(
                            `${response.body.results[0].date}`.split('T')[1],
                        ).to.be.eq('23:59:00.000Z');
                    });

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
                            (targets[0] as SchedulerSlackTarget)
                                .schedulerSlackTargetUuid,
                        ),
                        failOnStatusCode: false,
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
