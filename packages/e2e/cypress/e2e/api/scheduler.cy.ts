import {
    ChartScheduler,
    CreateSchedulerAndTargetsWithoutIds,
    DashboardScheduler,
    ScheduledJobs,
    SchedulerAndTargets,
    SchedulerFormat,
    SchedulerSlackTarget,
    SEED_ORG_1_EDITOR,
    SEED_ORG_1_VIEWER,
    SEED_ORG_2_ADMIN,
    SEED_PROJECT,
    UpdateSchedulerAndTargetsWithoutId,
    type ApiReassignSchedulerOwnerResponse,
    type Dashboard,
    type SavedChart,
} from '@lightdash/common';

const apiUrl = '/api/v1';

const cron = '59 23 * * *';
const createSchedulerBody: Omit<
    CreateSchedulerAndTargetsWithoutIds,
    'enabled' | 'includeLinks'
> = {
    name: 'test',
    cron,
    targets: [{ channel: 'C1' }, { channel: 'C2' }],
    format: SchedulerFormat.IMAGE,
    options: {},
    timezone: 'UTC', // Explicitely set the timezone to be UTC since the project default might have been changed which will make the tests fail
};

const getUpdateSchedulerBody = (
    schedulerSlackTargetUuid: string,
): Omit<UpdateSchedulerAndTargetsWithoutId, 'includeLinks'> => ({
    name: 'test2',
    cron,
    targets: [{ schedulerSlackTargetUuid, channel: 'C1' }, { channel: 'C3' }],
    format: SchedulerFormat.IMAGE,
    options: {},
});

describe('Lightdash scheduler endpoints', () => {
    beforeEach(() => {
        cy.login();
    });
    it('Should create/update/delete chart scheduler', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        cy.request(`${apiUrl}/projects/${projectUuid}/charts`).then(
            (projectResponse) => {
                const savedChart = projectResponse.body.results.find(
                    (s: SavedChart) =>
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
                    (d: Dashboard) => d.name === 'Jaffle dashboard',
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

    describe('Reassign scheduler owner', () => {
        let schedulerUuid: string;
        const projectUuid = SEED_PROJECT.project_uuid;

        beforeEach(() => {
            cy.login();
            // Create a scheduler to test with
            cy.request(`${apiUrl}/projects/${projectUuid}/charts`).then(
                (projectResponse) => {
                    const savedChart = projectResponse.body.results.find(
                        (s: SavedChart) =>
                            s.name ===
                            'How much revenue do we have per payment method?',
                    );

                    cy.request<{ results: SchedulerAndTargets }>({
                        url: `${apiUrl}/saved/${savedChart.uuid}/schedulers`,
                        headers: { 'Content-type': 'application/json' },
                        method: 'POST',
                        body: createSchedulerBody,
                    }).then((createResponse) => {
                        schedulerUuid =
                            createResponse.body.results.schedulerUuid;
                    });
                },
            );
        });

        afterEach(() => {
            // Clean up - delete the scheduler
            cy.login();
            if (schedulerUuid) {
                cy.request({
                    url: `${apiUrl}/schedulers/${schedulerUuid}`,
                    method: 'DELETE',
                    failOnStatusCode: false,
                });
            }
        });

        it('Should reassign scheduler ownership as admin', () => {
            cy.request<ApiReassignSchedulerOwnerResponse>({
                url: `${apiUrl}/schedulers/${projectUuid}/reassign-owner`,
                headers: { 'Content-type': 'application/json' },
                method: 'PATCH',
                body: {
                    schedulerUuids: [schedulerUuid],
                    newOwnerUserUuid: SEED_ORG_1_EDITOR.user_uuid,
                },
            }).then((response) => {
                expect(response.status).to.eq(200);
                expect(response.body.results).to.have.length(1);
                expect(response.body.results[0].schedulerUuid).to.eq(
                    schedulerUuid,
                );
                expect(response.body.results[0].createdBy).to.eq(
                    SEED_ORG_1_EDITOR.user_uuid,
                );
            });
        });

        it('Should reassign scheduler ownership as editor', () => {
            cy.loginAsEditor();
            cy.request<ApiReassignSchedulerOwnerResponse>({
                url: `${apiUrl}/schedulers/${projectUuid}/reassign-owner`,
                headers: { 'Content-type': 'application/json' },
                method: 'PATCH',
                body: {
                    schedulerUuids: [schedulerUuid],
                    newOwnerUserUuid: SEED_ORG_1_EDITOR.user_uuid,
                },
            }).then((response) => {
                expect(response.status).to.eq(200);
                expect(response.body.results).to.have.length(1);
                expect(response.body.results[0].createdBy).to.eq(
                    SEED_ORG_1_EDITOR.user_uuid,
                );
            });
        });

        it('Should fail to reassign scheduler ownership as viewer', () => {
            cy.loginAsViewer();
            cy.request({
                url: `${apiUrl}/schedulers/${projectUuid}/reassign-owner`,
                headers: { 'Content-type': 'application/json' },
                method: 'PATCH',
                body: {
                    schedulerUuids: [schedulerUuid],
                    newOwnerUserUuid: SEED_ORG_1_EDITOR.user_uuid,
                },
                failOnStatusCode: false,
            }).then((response) => {
                expect(response.status).to.eq(403);
            });
        });

        it('Should fail when scheduler does not exist', () => {
            cy.request({
                url: `${apiUrl}/schedulers/${projectUuid}/reassign-owner`,
                headers: { 'Content-type': 'application/json' },
                method: 'PATCH',
                body: {
                    schedulerUuids: ['00000000-0000-0000-0000-000000000000'],
                    newOwnerUserUuid: SEED_ORG_1_EDITOR.user_uuid,
                },
                failOnStatusCode: false,
            }).then((response) => {
                expect(response.status).to.eq(404);
            });
        });

        it('Should fail when new owner is not in organization', () => {
            cy.request({
                url: `${apiUrl}/schedulers/${projectUuid}/reassign-owner`,
                headers: { 'Content-type': 'application/json' },
                method: 'PATCH',
                body: {
                    schedulerUuids: [schedulerUuid],
                    newOwnerUserUuid: SEED_ORG_2_ADMIN.user_uuid,
                },
                failOnStatusCode: false,
            }).then((response) => {
                expect(response.status).to.eq(404);
            });
        });

        it('Should fail when new owner is a viewer (cannot create scheduled deliveries)', () => {
            cy.request({
                url: `${apiUrl}/schedulers/${projectUuid}/reassign-owner`,
                headers: { 'Content-type': 'application/json' },
                method: 'PATCH',
                body: {
                    schedulerUuids: [schedulerUuid],
                    newOwnerUserUuid: SEED_ORG_1_VIEWER.user_uuid,
                },
                failOnStatusCode: false,
            }).then((response) => {
                expect(response.status).to.eq(403);
            });
        });

        it('Should fail when schedulerUuids is empty', () => {
            cy.request({
                url: `${apiUrl}/schedulers/${projectUuid}/reassign-owner`,
                headers: { 'Content-type': 'application/json' },
                method: 'PATCH',
                body: {
                    schedulerUuids: [],
                    newOwnerUserUuid: SEED_ORG_1_EDITOR.user_uuid,
                },
                failOnStatusCode: false,
            }).then((response) => {
                expect(response.status).to.eq(400);
            });
        });
    });
});
