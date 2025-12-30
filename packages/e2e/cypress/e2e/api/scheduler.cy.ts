import {
    ChartScheduler,
    CreateSchedulerAndTargetsWithoutIds,
    DashboardScheduler,
    ScheduledJobs,
    SchedulerAndTargets,
    SchedulerFormat,
    SchedulerSlackTarget,
    SEED_ORG_1_ADMIN,
    SEED_ORG_1_EDITOR,
    SEED_ORG_1_VIEWER,
    SEED_ORG_2_ADMIN,
    SEED_PROJECT,
    UpdateSchedulerAndTargetsWithoutId,
    type ApiReassignSchedulerOwnerResponse,
    type ApiReassignUserSchedulersResponse,
    type ApiUserSchedulersSummaryResponse,
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

// Helper functions for scheduler creation and cleanup
const createChartScheduler = (): Cypress.Chainable<string> =>
    cy
        .request(`${apiUrl}/projects/${SEED_PROJECT.project_uuid}/charts`)
        .then((res) => {
            const chart = res.body.results.find(
                (s: SavedChart) =>
                    s.name ===
                    'How much revenue do we have per payment method?',
            );
            return cy.request<{ results: SchedulerAndTargets }>({
                url: `${apiUrl}/saved/${chart.uuid}/schedulers`,
                headers: { 'Content-type': 'application/json' },
                method: 'POST',
                body: createSchedulerBody,
            });
        })
        .then((res) => res.body.results.schedulerUuid);

const createDashboardScheduler = (): Cypress.Chainable<string> =>
    cy
        .request(`${apiUrl}/projects/${SEED_PROJECT.project_uuid}/dashboards`)
        .then((res) => {
            const dashboard = res.body.results.find(
                (d: Dashboard) => d.name === 'Jaffle dashboard',
            );
            return cy.request<{ results: SchedulerAndTargets }>({
                url: `${apiUrl}/dashboards/${dashboard.uuid}/schedulers`,
                headers: { 'Content-type': 'application/json' },
                method: 'POST',
                body: createSchedulerBody,
            });
        })
        .then((res) => res.body.results.schedulerUuid);

const createChartInDashboardScheduler = (): Cypress.Chainable<string> =>
    cy
        .request(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/chart-summaries`,
        )
        .then((res) => {
            const chart = res.body.results.find(
                (s: SavedChart) =>
                    s.name ===
                    '[Saved in dashboard] How much revenue do we have per payment method?',
            );
            return cy.request<{ results: SchedulerAndTargets }>({
                url: `${apiUrl}/saved/${chart.uuid}/schedulers`,
                headers: { 'Content-type': 'application/json' },
                method: 'POST',
                body: createSchedulerBody,
            });
        })
        .then((res) => res.body.results.schedulerUuid);

const deleteScheduler = (uuid: string): void => {
    cy.request({
        url: `${apiUrl}/schedulers/${uuid}`,
        method: 'DELETE',
        failOnStatusCode: false,
    });
};

const deleteSchedulers = (uuids: string[]): void => {
    uuids.filter(Boolean).forEach(deleteScheduler);
};

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

    describe('Scheduler reassignment', () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        describe('Reassign specific schedulers - /reassign-owner', () => {
            describe('Success cases by scheduler type', () => {
                let schedulerUuid: string;

                afterEach(() => {
                    cy.login();
                    if (schedulerUuid) {
                        deleteScheduler(schedulerUuid);
                    }
                });

                it('Should reassign standalone chart scheduler', () => {
                    createChartScheduler().then((uuid) => {
                        schedulerUuid = uuid;
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
                            expect(
                                response.body.results[0].schedulerUuid,
                            ).to.eq(schedulerUuid);
                            expect(response.body.results[0].createdBy).to.eq(
                                SEED_ORG_1_EDITOR.user_uuid,
                            );
                            expect(
                                response.body.results[0].savedChartUuid,
                            ).to.not.eq(null);
                            expect(
                                response.body.results[0].dashboardUuid,
                            ).to.eq(null);
                        });
                    });
                });

                it('Should reassign dashboard scheduler', () => {
                    createDashboardScheduler().then((uuid) => {
                        schedulerUuid = uuid;
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
                            expect(
                                response.body.results[0].schedulerUuid,
                            ).to.eq(schedulerUuid);
                            expect(response.body.results[0].createdBy).to.eq(
                                SEED_ORG_1_EDITOR.user_uuid,
                            );
                            expect(
                                response.body.results[0].dashboardUuid,
                            ).to.not.eq(null);
                            expect(
                                response.body.results[0].savedChartUuid,
                            ).to.eq(null);
                        });
                    });
                });

                it('Should reassign chart-in-dashboard scheduler', () => {
                    createChartInDashboardScheduler().then((uuid) => {
                        schedulerUuid = uuid;
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
                            expect(
                                response.body.results[0].schedulerUuid,
                            ).to.eq(schedulerUuid);
                            expect(response.body.results[0].createdBy).to.eq(
                                SEED_ORG_1_EDITOR.user_uuid,
                            );
                            expect(
                                response.body.results[0].savedChartUuid,
                            ).to.not.eq(null);
                            expect(
                                response.body.results[0].dashboardUuid,
                            ).to.eq(null);
                        });
                    });
                });
            });

            describe('Permission tests', () => {
                let schedulerUuid: string;

                beforeEach(() => {
                    cy.login();
                    createChartScheduler().then((uuid) => {
                        schedulerUuid = uuid;
                    });
                });

                afterEach(() => {
                    cy.login();
                    if (schedulerUuid) {
                        deleteScheduler(schedulerUuid);
                    }
                });

                it('Should succeed as admin', () => {
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

                it('Should succeed as editor', () => {
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

                it('Should fail as viewer', () => {
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
            });

            describe('Validation errors', () => {
                let schedulerUuid: string;

                beforeEach(() => {
                    cy.login();
                    createChartScheduler().then((uuid) => {
                        schedulerUuid = uuid;
                    });
                });

                afterEach(() => {
                    cy.login();
                    if (schedulerUuid) {
                        deleteScheduler(schedulerUuid);
                    }
                });

                it('Should fail when scheduler not found', () => {
                    cy.request({
                        url: `${apiUrl}/schedulers/${projectUuid}/reassign-owner`,
                        headers: { 'Content-type': 'application/json' },
                        method: 'PATCH',
                        body: {
                            schedulerUuids: [
                                '00000000-0000-0000-0000-000000000000',
                            ],
                            newOwnerUserUuid: SEED_ORG_1_EDITOR.user_uuid,
                        },
                        failOnStatusCode: false,
                    }).then((response) => {
                        expect(response.status).to.eq(404);
                    });
                });

                it('Should fail when new owner not in org', () => {
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

                it('Should fail when new owner is viewer', () => {
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

                it('Should fail when schedulerUuids empty', () => {
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

        describe('User scheduler summary - /schedulers-summary', () => {
            describe('Success cases', () => {
                let schedulerUuid: string;

                beforeEach(() => {
                    cy.login();
                    createChartScheduler().then((uuid) => {
                        schedulerUuid = uuid;
                    });
                });

                afterEach(() => {
                    cy.login();
                    if (schedulerUuid) {
                        deleteScheduler(schedulerUuid);
                    }
                });

                it('Should get summary as admin', () => {
                    cy.request<ApiUserSchedulersSummaryResponse>({
                        url: `${apiUrl}/org/user/${SEED_ORG_1_ADMIN.user_uuid}/schedulers-summary`,
                        method: 'GET',
                    }).then((response) => {
                        expect(response.status).to.eq(200);
                        expect(response.body.results).to.have.property(
                            'totalCount',
                        );
                        expect(response.body.results).to.have.property(
                            'byProject',
                        );
                        expect(response.body.results.totalCount).to.be.gte(1);
                        expect(response.body.results.byProject).to.be.an(
                            'array',
                        );
                    });
                });

                it('Should include all scheduler types in count', () => {
                    // Create additional schedulers of different types
                    let dashboardUuid: string;
                    let chartInDashboardUuid: string;

                    createDashboardScheduler().then((uuid) => {
                        dashboardUuid = uuid;
                    });
                    createChartInDashboardScheduler().then((uuid) => {
                        chartInDashboardUuid = uuid;
                    });

                    cy.request<ApiUserSchedulersSummaryResponse>({
                        url: `${apiUrl}/org/user/${SEED_ORG_1_ADMIN.user_uuid}/schedulers-summary`,
                        method: 'GET',
                    }).then((response) => {
                        expect(response.status).to.eq(200);
                        expect(response.body.results.totalCount).to.be.gte(3);

                        // Cleanup additional schedulers
                        deleteSchedulers([dashboardUuid, chartInDashboardUuid]);
                    });
                });

                it('Should return empty for user with no schedulers', () => {
                    cy.request<ApiUserSchedulersSummaryResponse>({
                        url: `${apiUrl}/org/user/${SEED_ORG_1_VIEWER.user_uuid}/schedulers-summary`,
                        method: 'GET',
                    }).then((response) => {
                        expect(response.status).to.eq(200);
                        expect(response.body.results.totalCount).to.eq(0);
                        expect(response.body.results.byProject).to.have.length(
                            0,
                        );
                    });
                });
            });

            describe('Error cases', () => {
                let schedulerUuid: string;

                // Create a scheduler so permission checks run
                // (the check only triggers if byProject has items)
                beforeEach(() => {
                    cy.login();
                    createChartScheduler().then((uuid) => {
                        schedulerUuid = uuid;
                    });
                });

                afterEach(() => {
                    cy.login();
                    if (schedulerUuid) {
                        deleteScheduler(schedulerUuid);
                    }
                });

                it('Should fail when user not found', () => {
                    cy.request({
                        url: `${apiUrl}/org/user/00000000-0000-0000-0000-000000000000/schedulers-summary`,
                        method: 'GET',
                        failOnStatusCode: false,
                    }).then((response) => {
                        expect(response.status).to.eq(404);
                    });
                });

                it('Should fail for user in different org', () => {
                    cy.request({
                        url: `${apiUrl}/org/user/${SEED_ORG_2_ADMIN.user_uuid}/schedulers-summary`,
                        method: 'GET',
                        failOnStatusCode: false,
                    }).then((response) => {
                        expect(response.status).to.eq(404);
                    });
                });

                it('Should fail as viewer', () => {
                    cy.loginAsViewer();
                    cy.request({
                        url: `${apiUrl}/org/user/${SEED_ORG_1_ADMIN.user_uuid}/schedulers-summary`,
                        method: 'GET',
                        failOnStatusCode: false,
                    }).then((response) => {
                        expect(response.status).to.eq(403);
                    });
                });
            });
        });

        describe('Reassign all user schedulers - /reassign-schedulers', () => {
            describe('Success cases by scheduler type', () => {
                let chartSchedulerUuid: string;
                let dashboardSchedulerUuid: string;
                let chartInDashboardSchedulerUuid: string;

                afterEach(() => {
                    cy.login();
                    deleteSchedulers([
                        chartSchedulerUuid,
                        dashboardSchedulerUuid,
                        chartInDashboardSchedulerUuid,
                    ]);
                });

                it('Should reassign all chart schedulers', () => {
                    createChartScheduler().then((uuid) => {
                        chartSchedulerUuid = uuid;

                        cy.request<ApiReassignUserSchedulersResponse>({
                            url: `${apiUrl}/org/user/${SEED_ORG_1_ADMIN.user_uuid}/reassign-schedulers`,
                            headers: { 'Content-type': 'application/json' },
                            method: 'PATCH',
                            body: {
                                newOwnerUserUuid: SEED_ORG_1_EDITOR.user_uuid,
                            },
                        }).then((response) => {
                            expect(response.status).to.eq(200);
                            expect(
                                response.body.results.reassignedCount,
                            ).to.be.gte(1);
                        });

                        cy.request<{ results: SchedulerAndTargets }>({
                            url: `${apiUrl}/schedulers/${chartSchedulerUuid}`,
                            method: 'GET',
                        }).then((response) => {
                            expect(response.body.results.createdBy).to.eq(
                                SEED_ORG_1_EDITOR.user_uuid,
                            );
                        });
                    });
                });

                it('Should reassign all dashboard schedulers', () => {
                    createDashboardScheduler().then((uuid) => {
                        dashboardSchedulerUuid = uuid;

                        cy.request<ApiReassignUserSchedulersResponse>({
                            url: `${apiUrl}/org/user/${SEED_ORG_1_ADMIN.user_uuid}/reassign-schedulers`,
                            headers: { 'Content-type': 'application/json' },
                            method: 'PATCH',
                            body: {
                                newOwnerUserUuid: SEED_ORG_1_EDITOR.user_uuid,
                            },
                        }).then((response) => {
                            expect(response.status).to.eq(200);
                            expect(
                                response.body.results.reassignedCount,
                            ).to.be.gte(1);
                        });

                        cy.request<{ results: SchedulerAndTargets }>({
                            url: `${apiUrl}/schedulers/${dashboardSchedulerUuid}`,
                            method: 'GET',
                        }).then((response) => {
                            expect(response.body.results.createdBy).to.eq(
                                SEED_ORG_1_EDITOR.user_uuid,
                            );
                        });
                    });
                });

                it('Should reassign all chart-in-dashboard schedulers', () => {
                    createChartInDashboardScheduler().then((uuid) => {
                        chartInDashboardSchedulerUuid = uuid;

                        cy.request<ApiReassignUserSchedulersResponse>({
                            url: `${apiUrl}/org/user/${SEED_ORG_1_ADMIN.user_uuid}/reassign-schedulers`,
                            headers: { 'Content-type': 'application/json' },
                            method: 'PATCH',
                            body: {
                                newOwnerUserUuid: SEED_ORG_1_EDITOR.user_uuid,
                            },
                        }).then((response) => {
                            expect(response.status).to.eq(200);
                            expect(
                                response.body.results.reassignedCount,
                            ).to.be.gte(1);
                        });

                        cy.request<{ results: SchedulerAndTargets }>({
                            url: `${apiUrl}/schedulers/${chartInDashboardSchedulerUuid}`,
                            method: 'GET',
                        }).then((response) => {
                            expect(response.body.results.createdBy).to.eq(
                                SEED_ORG_1_EDITOR.user_uuid,
                            );
                        });
                    });
                });

                it('Should reassign mixed scheduler types', () => {
                    createChartScheduler().then((uuid) => {
                        chartSchedulerUuid = uuid;
                    });
                    createDashboardScheduler().then((uuid) => {
                        dashboardSchedulerUuid = uuid;
                    });
                    createChartInDashboardScheduler().then((uuid) => {
                        chartInDashboardSchedulerUuid = uuid;

                        cy.request<ApiReassignUserSchedulersResponse>({
                            url: `${apiUrl}/org/user/${SEED_ORG_1_ADMIN.user_uuid}/reassign-schedulers`,
                            headers: { 'Content-type': 'application/json' },
                            method: 'PATCH',
                            body: {
                                newOwnerUserUuid: SEED_ORG_1_EDITOR.user_uuid,
                            },
                        }).then((response) => {
                            expect(response.status).to.eq(200);
                            expect(
                                response.body.results.reassignedCount,
                            ).to.be.gte(3);
                        });

                        // Verify each scheduler was reassigned
                        cy.request<{ results: SchedulerAndTargets }>({
                            url: `${apiUrl}/schedulers/${chartSchedulerUuid}`,
                            method: 'GET',
                        }).then((response) => {
                            expect(response.body.results.createdBy).to.eq(
                                SEED_ORG_1_EDITOR.user_uuid,
                            );
                        });

                        cy.request<{ results: SchedulerAndTargets }>({
                            url: `${apiUrl}/schedulers/${dashboardSchedulerUuid}`,
                            method: 'GET',
                        }).then((response) => {
                            expect(response.body.results.createdBy).to.eq(
                                SEED_ORG_1_EDITOR.user_uuid,
                            );
                        });

                        cy.request<{ results: SchedulerAndTargets }>({
                            url: `${apiUrl}/schedulers/${chartInDashboardSchedulerUuid}`,
                            method: 'GET',
                        }).then((response) => {
                            expect(response.body.results.createdBy).to.eq(
                                SEED_ORG_1_EDITOR.user_uuid,
                            );
                        });
                    });
                });

                it('Should return 0 for user with no schedulers', () => {
                    cy.request<ApiReassignUserSchedulersResponse>({
                        url: `${apiUrl}/org/user/${SEED_ORG_1_VIEWER.user_uuid}/reassign-schedulers`,
                        headers: { 'Content-type': 'application/json' },
                        method: 'PATCH',
                        body: {
                            newOwnerUserUuid: SEED_ORG_1_EDITOR.user_uuid,
                        },
                    }).then((response) => {
                        expect(response.status).to.eq(200);
                        expect(response.body.results.reassignedCount).to.eq(0);
                    });
                });
            });

            describe('Error cases', () => {
                let schedulerUuid: string;

                // Create a scheduler so that validation checks run
                // (the service returns early if there are no schedulers)
                beforeEach(() => {
                    cy.login();
                    createChartScheduler().then((uuid) => {
                        schedulerUuid = uuid;
                    });
                });

                afterEach(() => {
                    cy.login();
                    if (schedulerUuid) {
                        deleteScheduler(schedulerUuid);
                    }
                });

                it('Should fail when fromUser not found', () => {
                    cy.request({
                        url: `${apiUrl}/org/user/00000000-0000-0000-0000-000000000000/reassign-schedulers`,
                        headers: { 'Content-type': 'application/json' },
                        method: 'PATCH',
                        body: {
                            newOwnerUserUuid: SEED_ORG_1_EDITOR.user_uuid,
                        },
                        failOnStatusCode: false,
                    }).then((response) => {
                        expect(response.status).to.eq(404);
                    });
                });

                it('Should fail when fromUser in different org', () => {
                    cy.request({
                        url: `${apiUrl}/org/user/${SEED_ORG_2_ADMIN.user_uuid}/reassign-schedulers`,
                        headers: { 'Content-type': 'application/json' },
                        method: 'PATCH',
                        body: {
                            newOwnerUserUuid: SEED_ORG_1_EDITOR.user_uuid,
                        },
                        failOnStatusCode: false,
                    }).then((response) => {
                        expect(response.status).to.eq(404);
                    });
                });

                it('Should fail when new owner in different org', () => {
                    cy.request({
                        url: `${apiUrl}/org/user/${SEED_ORG_1_ADMIN.user_uuid}/reassign-schedulers`,
                        headers: { 'Content-type': 'application/json' },
                        method: 'PATCH',
                        body: {
                            newOwnerUserUuid: SEED_ORG_2_ADMIN.user_uuid,
                        },
                        failOnStatusCode: false,
                    }).then((response) => {
                        expect(response.status).to.eq(404);
                    });
                });

                it('Should fail when new owner is viewer', () => {
                    cy.request({
                        url: `${apiUrl}/org/user/${SEED_ORG_1_ADMIN.user_uuid}/reassign-schedulers`,
                        headers: { 'Content-type': 'application/json' },
                        method: 'PATCH',
                        body: {
                            newOwnerUserUuid: SEED_ORG_1_VIEWER.user_uuid,
                        },
                        failOnStatusCode: false,
                    }).then((response) => {
                        expect(response.status).to.eq(403);
                    });
                });

                it('Should fail as viewer', () => {
                    cy.loginAsViewer();
                    cy.request({
                        url: `${apiUrl}/org/user/${SEED_ORG_1_ADMIN.user_uuid}/reassign-schedulers`,
                        headers: { 'Content-type': 'application/json' },
                        method: 'PATCH',
                        body: {
                            newOwnerUserUuid: SEED_ORG_1_EDITOR.user_uuid,
                        },
                        failOnStatusCode: false,
                    }).then((response) => {
                        expect(response.status).to.eq(403);
                    });
                });
            });
        });
    });
});
