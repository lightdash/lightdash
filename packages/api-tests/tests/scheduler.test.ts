import {
    SchedulerFormat,
    SEED_ORG_1_ADMIN,
    SEED_ORG_1_EDITOR,
    SEED_ORG_1_VIEWER,
    SEED_ORG_2_ADMIN,
    SEED_PROJECT,
    type ApiReassignSchedulerOwnerResponse,
    type ApiReassignUserSchedulersResponse,
    type ApiUserSchedulersSummaryResponse,
    type ChartScheduler,
    type CreateSchedulerAndTargetsWithoutIds,
    type Dashboard,
    type DashboardScheduler,
    type SavedChart,
    type ScheduledJobs,
    type SchedulerAndTargets,
    type SchedulerSlackTarget,
    type UpdateSchedulerAndTargetsWithoutId,
} from '@lightdash/common';
import type { ApiClient } from '../helpers/api-client';
import { login, loginAsEditor, loginAsViewer } from '../helpers/auth';

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
    timezone: 'UTC', // Explicitly set the timezone to be UTC since the project default might have been changed which will make the tests fail
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
async function createChartScheduler(client: ApiClient): Promise<string> {
    const chartsResp = await client.get<{ results: SavedChart[] }>(
        `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/charts`,
    );
    const chart = chartsResp.body.results.find(
        (s) => s.name === 'How much revenue do we have per payment method?',
    );
    const createResp = await client.post<{ results: SchedulerAndTargets }>(
        `${apiUrl}/saved/${chart!.uuid}/schedulers`,
        createSchedulerBody,
    );
    return createResp.body.results.schedulerUuid;
}

async function createDashboardScheduler(client: ApiClient): Promise<string> {
    const dashResp = await client.get<{ results: Dashboard[] }>(
        `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/dashboards`,
    );
    const dashboard = dashResp.body.results.find(
        (d) => d.name === 'Jaffle dashboard',
    );
    const createResp = await client.post<{ results: SchedulerAndTargets }>(
        `${apiUrl}/dashboards/${dashboard!.uuid}/schedulers`,
        createSchedulerBody,
    );
    return createResp.body.results.schedulerUuid;
}

async function createChartInDashboardScheduler(
    client: ApiClient,
): Promise<string> {
    const chartsResp = await client.get<{ results: SavedChart[] }>(
        `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/chart-summaries`,
    );
    const chart = chartsResp.body.results.find(
        (s) =>
            s.name ===
            '[Saved in dashboard] How much revenue do we have per payment method?',
    );
    const createResp = await client.post<{ results: SchedulerAndTargets }>(
        `${apiUrl}/saved/${chart!.uuid}/schedulers`,
        createSchedulerBody,
    );
    return createResp.body.results.schedulerUuid;
}

async function deleteScheduler(client: ApiClient, uuid: string): Promise<void> {
    await client.delete(`${apiUrl}/schedulers/${uuid}`, {
        failOnStatusCode: false,
    });
}

async function deleteSchedulers(
    client: ApiClient,
    uuids: string[],
): Promise<void> {
    for (const uuid of uuids.filter(Boolean)) {
        await deleteScheduler(client, uuid);
    }
}

describe('Lightdash scheduler endpoints', () => {
    let admin: ApiClient;

    beforeAll(async () => {
        admin = await login();
    });

    it('Should create/update/delete chart scheduler', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const projectResponse = await admin.get<{ results: SavedChart[] }>(
            `${apiUrl}/projects/${projectUuid}/charts`,
        );
        const savedChart = projectResponse.body.results.find(
            (s) => s.name === 'How much revenue do we have per payment method?',
        );

        // Create
        const createResponse = await admin.post<{
            results: SchedulerAndTargets;
        }>(
            `${apiUrl}/saved/${savedChart!.uuid}/schedulers`,
            createSchedulerBody,
        );

        expect(createResponse.body.results).toHaveProperty('schedulerUuid');
        expect(createResponse.body.results.savedChartUuid).toBe(
            savedChart!.uuid,
        );
        expect(createResponse.body.results.targets).toHaveLength(2);

        const { schedulerUuid, targets } = createResponse.body.results;

        // Get all chart schedulers
        const chartSchedulersResp = await admin.get<{
            results: ChartScheduler[];
        }>(`${apiUrl}/saved/${savedChart!.uuid}/schedulers`);
        const schedulerIds = chartSchedulersResp.body.results.map(
            (r) => r.schedulerUuid,
        );
        expect(schedulerIds).toContain(schedulerUuid);

        // Get created jobs
        const jobsResp = await admin.get<{ results: ScheduledJobs[] }>(
            `${apiUrl}/schedulers/${schedulerUuid}/jobs`,
        );
        expect(jobsResp.body.results).toHaveLength(1);
        expect(`${jobsResp.body.results[0].date}`.split('T')[1]).toBe(
            '23:59:00.000Z',
        );

        // Update
        const updateResponse = await admin.patch<{
            results: SchedulerAndTargets;
        }>(
            `${apiUrl}/schedulers/${schedulerUuid}`,
            getUpdateSchedulerBody(
                (targets[0] as SchedulerSlackTarget).schedulerSlackTargetUuid,
            ),
        );
        expect(updateResponse.body.results.name).toBe('test2');
        expect(updateResponse.body.results.cron).toBe(cron);
        expect(updateResponse.body.results.targets).toHaveLength(2);
        expect(
            (updateResponse.body.results.targets[0] as SchedulerSlackTarget)
                .channel,
        ).toBe('C1');
        expect(
            (updateResponse.body.results.targets[1] as SchedulerSlackTarget)
                .channel,
        ).toBe('C3');

        // Delete
        const deleteResponse = await admin.delete(
            `${apiUrl}/schedulers/${schedulerUuid}`,
            { failOnStatusCode: false },
        );
        expect(deleteResponse.status).toBe(200);

        // Jobs are deleted
        const deletedJobsResp = await admin.get(
            `${apiUrl}/schedulers/${schedulerUuid}/jobs`,
            { failOnStatusCode: false },
        );
        expect(deletedJobsResp.status).toBe(404);
    });

    it('Should create/update/delete dashboard scheduler', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const projectResponse = await admin.get<{ results: Dashboard[] }>(
            `${apiUrl}/projects/${projectUuid}/dashboards`,
        );
        const dashboard = projectResponse.body.results.find(
            (d) => d.name === 'Jaffle dashboard',
        );

        // Create
        const createResponse = await admin.post<{
            results: SchedulerAndTargets;
        }>(
            `${apiUrl}/dashboards/${dashboard!.uuid}/schedulers`,
            createSchedulerBody,
        );
        expect(createResponse.body.results).toHaveProperty('schedulerUuid');
        expect(createResponse.body.results.dashboardUuid).toBe(dashboard!.uuid);
        expect(createResponse.body.results.targets).toHaveLength(2);

        const { schedulerUuid, targets } = createResponse.body.results;

        // Get created jobs
        const jobsResp = await admin.get<{ results: ScheduledJobs[] }>(
            `${apiUrl}/schedulers/${schedulerUuid}/jobs`,
        );
        expect(jobsResp.body.results).toHaveLength(1);
        expect(`${jobsResp.body.results[0].date}`.split('T')[1]).toBe(
            '23:59:00.000Z',
        );

        // Get all dashboard schedulers
        const dashSchedulersResp = await admin.get<{
            results: DashboardScheduler[];
        }>(`${apiUrl}/dashboards/${dashboard!.uuid}/schedulers`);
        const schedulerIds = dashSchedulersResp.body.results.map(
            (r) => r.schedulerUuid,
        );
        expect(schedulerIds).toContain(
            createResponse.body.results.schedulerUuid,
        );

        // Update
        const updateResponse = await admin.patch<{
            results: SchedulerAndTargets;
        }>(
            `${apiUrl}/schedulers/${schedulerUuid}`,
            getUpdateSchedulerBody(
                (targets[0] as SchedulerSlackTarget).schedulerSlackTargetUuid,
            ),
        );
        expect(updateResponse.body.results.name).toBe('test2');
        expect(updateResponse.body.results.cron).toBe(cron);
        expect(updateResponse.body.results.targets).toHaveLength(2);
        expect(
            (updateResponse.body.results.targets[0] as SchedulerSlackTarget)
                .channel,
        ).toBe('C1');
        expect(
            (updateResponse.body.results.targets[1] as SchedulerSlackTarget)
                .channel,
        ).toBe('C3');

        // Delete
        const deleteResponse = await admin.delete(
            `${apiUrl}/schedulers/${schedulerUuid}`,
            { failOnStatusCode: false },
        );
        expect(deleteResponse.status).toBe(200);

        // Jobs are deleted
        const deletedJobsResp = await admin.get(
            `${apiUrl}/schedulers/${schedulerUuid}/jobs`,
            { failOnStatusCode: false },
        );
        expect(deletedJobsResp.status).toBe(404);
    });

    describe('Scheduler reassignment', () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        describe('Reassign specific schedulers - /reassign-owner', () => {
            describe('Success cases by scheduler type', () => {
                let schedulerUuid: string;

                afterEach(async () => {
                    const adminClient = await login();
                    if (schedulerUuid) {
                        await deleteScheduler(adminClient, schedulerUuid);
                    }
                });

                it('Should reassign standalone chart scheduler', async () => {
                    schedulerUuid = await createChartScheduler(admin);

                    const response =
                        await admin.patch<ApiReassignSchedulerOwnerResponse>(
                            `${apiUrl}/schedulers/${projectUuid}/reassign-owner`,
                            {
                                schedulerUuids: [schedulerUuid],
                                newOwnerUserUuid: SEED_ORG_1_EDITOR.user_uuid,
                            },
                        );
                    expect(response.status).toBe(200);
                    expect(response.body.results).toHaveLength(1);
                    expect(response.body.results[0].schedulerUuid).toBe(
                        schedulerUuid,
                    );
                    expect(response.body.results[0].createdBy).toBe(
                        SEED_ORG_1_EDITOR.user_uuid,
                    );
                    expect(response.body.results[0].savedChartUuid).not.toBe(
                        null,
                    );
                    expect(response.body.results[0].dashboardUuid).toBe(null);
                });

                it('Should reassign dashboard scheduler', async () => {
                    schedulerUuid = await createDashboardScheduler(admin);

                    const response =
                        await admin.patch<ApiReassignSchedulerOwnerResponse>(
                            `${apiUrl}/schedulers/${projectUuid}/reassign-owner`,
                            {
                                schedulerUuids: [schedulerUuid],
                                newOwnerUserUuid: SEED_ORG_1_EDITOR.user_uuid,
                            },
                        );
                    expect(response.status).toBe(200);
                    expect(response.body.results).toHaveLength(1);
                    expect(response.body.results[0].schedulerUuid).toBe(
                        schedulerUuid,
                    );
                    expect(response.body.results[0].createdBy).toBe(
                        SEED_ORG_1_EDITOR.user_uuid,
                    );
                    expect(response.body.results[0].dashboardUuid).not.toBe(
                        null,
                    );
                    expect(response.body.results[0].savedChartUuid).toBe(null);
                });

                it('Should reassign chart-in-dashboard scheduler', async () => {
                    schedulerUuid =
                        await createChartInDashboardScheduler(admin);

                    const response =
                        await admin.patch<ApiReassignSchedulerOwnerResponse>(
                            `${apiUrl}/schedulers/${projectUuid}/reassign-owner`,
                            {
                                schedulerUuids: [schedulerUuid],
                                newOwnerUserUuid: SEED_ORG_1_EDITOR.user_uuid,
                            },
                        );
                    expect(response.status).toBe(200);
                    expect(response.body.results).toHaveLength(1);
                    expect(response.body.results[0].schedulerUuid).toBe(
                        schedulerUuid,
                    );
                    expect(response.body.results[0].createdBy).toBe(
                        SEED_ORG_1_EDITOR.user_uuid,
                    );
                    expect(response.body.results[0].savedChartUuid).not.toBe(
                        null,
                    );
                    expect(response.body.results[0].dashboardUuid).toBe(null);
                });
            });

            describe('Permission tests', () => {
                let schedulerUuid: string;

                afterEach(async () => {
                    const adminClient = await login();
                    if (schedulerUuid) {
                        await deleteScheduler(adminClient, schedulerUuid);
                    }
                });

                it('Should succeed as admin', async () => {
                    schedulerUuid = await createChartScheduler(admin);

                    const response =
                        await admin.patch<ApiReassignSchedulerOwnerResponse>(
                            `${apiUrl}/schedulers/${projectUuid}/reassign-owner`,
                            {
                                schedulerUuids: [schedulerUuid],
                                newOwnerUserUuid: SEED_ORG_1_EDITOR.user_uuid,
                            },
                        );
                    expect(response.status).toBe(200);
                    expect(response.body.results).toHaveLength(1);
                    expect(response.body.results[0].createdBy).toBe(
                        SEED_ORG_1_EDITOR.user_uuid,
                    );
                });

                it('Should succeed as editor when they own the scheduler', async () => {
                    const editor = await loginAsEditor();
                    schedulerUuid = await createChartScheduler(editor);

                    const response =
                        await editor.patch<ApiReassignSchedulerOwnerResponse>(
                            `${apiUrl}/schedulers/${projectUuid}/reassign-owner`,
                            {
                                schedulerUuids: [schedulerUuid],
                                newOwnerUserUuid: SEED_ORG_1_ADMIN.user_uuid,
                            },
                        );
                    expect(response.status).toBe(200);
                    expect(response.body.results).toHaveLength(1);
                    expect(response.body.results[0].createdBy).toBe(
                        SEED_ORG_1_ADMIN.user_uuid,
                    );
                });

                it('Should fail as editor when they do not own the scheduler', async () => {
                    schedulerUuid = await createChartScheduler(admin);

                    const editor = await loginAsEditor();
                    const response = await editor.patch(
                        `${apiUrl}/schedulers/${projectUuid}/reassign-owner`,
                        {
                            schedulerUuids: [schedulerUuid],
                            newOwnerUserUuid: SEED_ORG_1_EDITOR.user_uuid,
                        },
                        { failOnStatusCode: false },
                    );
                    expect(response.status).toBe(403);
                });

                it('Should fail as viewer', async () => {
                    schedulerUuid = await createChartScheduler(admin);

                    const viewer = await loginAsViewer();
                    const response = await viewer.patch(
                        `${apiUrl}/schedulers/${projectUuid}/reassign-owner`,
                        {
                            schedulerUuids: [schedulerUuid],
                            newOwnerUserUuid: SEED_ORG_1_EDITOR.user_uuid,
                        },
                        { failOnStatusCode: false },
                    );
                    expect(response.status).toBe(403);
                });
            });

            describe('Validation errors', () => {
                let schedulerUuid: string;

                beforeEach(async () => {
                    schedulerUuid = await createChartScheduler(admin);
                });

                afterEach(async () => {
                    const adminClient = await login();
                    if (schedulerUuid) {
                        await deleteScheduler(adminClient, schedulerUuid);
                    }
                });

                it('Should fail when scheduler not found', async () => {
                    const response = await admin.patch(
                        `${apiUrl}/schedulers/${projectUuid}/reassign-owner`,
                        {
                            schedulerUuids: [
                                '00000000-0000-0000-0000-000000000000',
                            ],
                            newOwnerUserUuid: SEED_ORG_1_EDITOR.user_uuid,
                        },
                        { failOnStatusCode: false },
                    );
                    expect(response.status).toBe(404);
                });

                it('Should fail when new owner not in org', async () => {
                    const response = await admin.patch(
                        `${apiUrl}/schedulers/${projectUuid}/reassign-owner`,
                        {
                            schedulerUuids: [schedulerUuid],
                            newOwnerUserUuid: SEED_ORG_2_ADMIN.user_uuid,
                        },
                        { failOnStatusCode: false },
                    );
                    expect(response.status).toBe(404);
                });

                it('Should fail when new owner is viewer', async () => {
                    const response = await admin.patch(
                        `${apiUrl}/schedulers/${projectUuid}/reassign-owner`,
                        {
                            schedulerUuids: [schedulerUuid],
                            newOwnerUserUuid: SEED_ORG_1_VIEWER.user_uuid,
                        },
                        { failOnStatusCode: false },
                    );
                    expect(response.status).toBe(403);
                });

                it('Should fail when schedulerUuids empty', async () => {
                    const response = await admin.patch(
                        `${apiUrl}/schedulers/${projectUuid}/reassign-owner`,
                        {
                            schedulerUuids: [],
                            newOwnerUserUuid: SEED_ORG_1_EDITOR.user_uuid,
                        },
                        { failOnStatusCode: false },
                    );
                    expect(response.status).toBe(400);
                });
            });
        });

        describe('User scheduler summary - /schedulers-summary', () => {
            describe('Success cases', () => {
                let schedulerUuid: string;

                beforeEach(async () => {
                    schedulerUuid = await createChartScheduler(admin);
                });

                afterEach(async () => {
                    const adminClient = await login();
                    if (schedulerUuid) {
                        await deleteScheduler(adminClient, schedulerUuid);
                    }
                });

                it('Should get summary as admin', async () => {
                    const response =
                        await admin.get<ApiUserSchedulersSummaryResponse>(
                            `${apiUrl}/org/user/${SEED_ORG_1_ADMIN.user_uuid}/schedulers-summary`,
                        );
                    expect(response.status).toBe(200);
                    expect(response.body.results).toHaveProperty('totalCount');
                    expect(response.body.results).toHaveProperty('byProject');
                    expect(
                        response.body.results.totalCount,
                    ).toBeGreaterThanOrEqual(1);
                    expect(Array.isArray(response.body.results.byProject)).toBe(
                        true,
                    );
                });

                it('Should include all scheduler types in count', async () => {
                    // Create additional schedulers of different types
                    const dashboardUuid = await createDashboardScheduler(admin);
                    const chartInDashboardUuid =
                        await createChartInDashboardScheduler(admin);

                    const response =
                        await admin.get<ApiUserSchedulersSummaryResponse>(
                            `${apiUrl}/org/user/${SEED_ORG_1_ADMIN.user_uuid}/schedulers-summary`,
                        );
                    expect(response.status).toBe(200);
                    expect(
                        response.body.results.totalCount,
                    ).toBeGreaterThanOrEqual(3);

                    // Cleanup additional schedulers
                    await deleteSchedulers(admin, [
                        dashboardUuid,
                        chartInDashboardUuid,
                    ]);
                });

                it('Should return empty for user with no schedulers', async () => {
                    const response =
                        await admin.get<ApiUserSchedulersSummaryResponse>(
                            `${apiUrl}/org/user/${SEED_ORG_1_VIEWER.user_uuid}/schedulers-summary`,
                        );
                    expect(response.status).toBe(200);
                    expect(response.body.results.totalCount).toBe(0);
                    expect(response.body.results.byProject).toHaveLength(0);
                });
            });

            describe('Error cases', () => {
                let schedulerUuid: string;

                // Create a scheduler so permission checks run
                // (the check only triggers if byProject has items)
                beforeEach(async () => {
                    schedulerUuid = await createChartScheduler(admin);
                });

                afterEach(async () => {
                    const adminClient = await login();
                    if (schedulerUuid) {
                        await deleteScheduler(adminClient, schedulerUuid);
                    }
                });

                it('Should fail when user not found', async () => {
                    const response = await admin.get(
                        `${apiUrl}/org/user/00000000-0000-0000-0000-000000000000/schedulers-summary`,
                        { failOnStatusCode: false },
                    );
                    expect(response.status).toBe(404);
                });

                it('Should fail for user in different org', async () => {
                    const response = await admin.get(
                        `${apiUrl}/org/user/${SEED_ORG_2_ADMIN.user_uuid}/schedulers-summary`,
                        { failOnStatusCode: false },
                    );
                    expect(response.status).toBe(404);
                });

                it('Should fail as viewer', async () => {
                    const viewer = await loginAsViewer();
                    const response = await viewer.get(
                        `${apiUrl}/org/user/${SEED_ORG_1_ADMIN.user_uuid}/schedulers-summary`,
                        { failOnStatusCode: false },
                    );
                    expect(response.status).toBe(403);
                });
            });
        });

        describe('Reassign all user schedulers - /reassign-schedulers', () => {
            describe('Success cases by scheduler type', () => {
                let chartSchedulerUuid: string;
                let dashboardSchedulerUuid: string;
                let chartInDashboardSchedulerUuid: string;

                afterEach(async () => {
                    const adminClient = await login();
                    await deleteSchedulers(adminClient, [
                        chartSchedulerUuid,
                        dashboardSchedulerUuid,
                        chartInDashboardSchedulerUuid,
                    ]);
                });

                it('Should reassign all chart schedulers', async () => {
                    chartSchedulerUuid = await createChartScheduler(admin);

                    const response =
                        await admin.patch<ApiReassignUserSchedulersResponse>(
                            `${apiUrl}/org/user/${SEED_ORG_1_ADMIN.user_uuid}/reassign-schedulers`,
                            {
                                newOwnerUserUuid: SEED_ORG_1_EDITOR.user_uuid,
                            },
                        );
                    expect(response.status).toBe(200);
                    expect(
                        response.body.results.reassignedCount,
                    ).toBeGreaterThanOrEqual(1);

                    const verifyResp = await admin.get<{
                        results: SchedulerAndTargets;
                    }>(`${apiUrl}/schedulers/${chartSchedulerUuid}`);
                    expect(verifyResp.body.results.createdBy).toBe(
                        SEED_ORG_1_EDITOR.user_uuid,
                    );
                });

                it('Should reassign all dashboard schedulers', async () => {
                    dashboardSchedulerUuid =
                        await createDashboardScheduler(admin);

                    const response =
                        await admin.patch<ApiReassignUserSchedulersResponse>(
                            `${apiUrl}/org/user/${SEED_ORG_1_ADMIN.user_uuid}/reassign-schedulers`,
                            {
                                newOwnerUserUuid: SEED_ORG_1_EDITOR.user_uuid,
                            },
                        );
                    expect(response.status).toBe(200);
                    expect(
                        response.body.results.reassignedCount,
                    ).toBeGreaterThanOrEqual(1);

                    const verifyResp = await admin.get<{
                        results: SchedulerAndTargets;
                    }>(`${apiUrl}/schedulers/${dashboardSchedulerUuid}`);
                    expect(verifyResp.body.results.createdBy).toBe(
                        SEED_ORG_1_EDITOR.user_uuid,
                    );
                });

                it('Should reassign all chart-in-dashboard schedulers', async () => {
                    chartInDashboardSchedulerUuid =
                        await createChartInDashboardScheduler(admin);

                    const response =
                        await admin.patch<ApiReassignUserSchedulersResponse>(
                            `${apiUrl}/org/user/${SEED_ORG_1_ADMIN.user_uuid}/reassign-schedulers`,
                            {
                                newOwnerUserUuid: SEED_ORG_1_EDITOR.user_uuid,
                            },
                        );
                    expect(response.status).toBe(200);
                    expect(
                        response.body.results.reassignedCount,
                    ).toBeGreaterThanOrEqual(1);

                    const verifyResp = await admin.get<{
                        results: SchedulerAndTargets;
                    }>(`${apiUrl}/schedulers/${chartInDashboardSchedulerUuid}`);
                    expect(verifyResp.body.results.createdBy).toBe(
                        SEED_ORG_1_EDITOR.user_uuid,
                    );
                });

                it('Should reassign mixed scheduler types', async () => {
                    chartSchedulerUuid = await createChartScheduler(admin);
                    dashboardSchedulerUuid =
                        await createDashboardScheduler(admin);
                    chartInDashboardSchedulerUuid =
                        await createChartInDashboardScheduler(admin);

                    const response =
                        await admin.patch<ApiReassignUserSchedulersResponse>(
                            `${apiUrl}/org/user/${SEED_ORG_1_ADMIN.user_uuid}/reassign-schedulers`,
                            {
                                newOwnerUserUuid: SEED_ORG_1_EDITOR.user_uuid,
                            },
                        );
                    expect(response.status).toBe(200);
                    expect(
                        response.body.results.reassignedCount,
                    ).toBeGreaterThanOrEqual(3);

                    // Verify each scheduler was reassigned
                    const verifyChart = await admin.get<{
                        results: SchedulerAndTargets;
                    }>(`${apiUrl}/schedulers/${chartSchedulerUuid}`);
                    expect(verifyChart.body.results.createdBy).toBe(
                        SEED_ORG_1_EDITOR.user_uuid,
                    );

                    const verifyDash = await admin.get<{
                        results: SchedulerAndTargets;
                    }>(`${apiUrl}/schedulers/${dashboardSchedulerUuid}`);
                    expect(verifyDash.body.results.createdBy).toBe(
                        SEED_ORG_1_EDITOR.user_uuid,
                    );

                    const verifyChartInDash = await admin.get<{
                        results: SchedulerAndTargets;
                    }>(`${apiUrl}/schedulers/${chartInDashboardSchedulerUuid}`);
                    expect(verifyChartInDash.body.results.createdBy).toBe(
                        SEED_ORG_1_EDITOR.user_uuid,
                    );
                });

                it('Should return 0 for user with no schedulers', async () => {
                    const response =
                        await admin.patch<ApiReassignUserSchedulersResponse>(
                            `${apiUrl}/org/user/${SEED_ORG_1_VIEWER.user_uuid}/reassign-schedulers`,
                            {
                                newOwnerUserUuid: SEED_ORG_1_EDITOR.user_uuid,
                            },
                        );
                    expect(response.status).toBe(200);
                    expect(response.body.results.reassignedCount).toBe(0);
                });
            });

            describe('Error cases', () => {
                let schedulerUuid: string;

                // Create a scheduler so that validation checks run
                // (the service returns early if there are no schedulers)
                beforeEach(async () => {
                    schedulerUuid = await createChartScheduler(admin);
                });

                afterEach(async () => {
                    const adminClient = await login();
                    if (schedulerUuid) {
                        await deleteScheduler(adminClient, schedulerUuid);
                    }
                });

                it('Should fail when fromUser not found', async () => {
                    const response = await admin.patch(
                        `${apiUrl}/org/user/00000000-0000-0000-0000-000000000000/reassign-schedulers`,
                        {
                            newOwnerUserUuid: SEED_ORG_1_EDITOR.user_uuid,
                        },
                        { failOnStatusCode: false },
                    );
                    expect(response.status).toBe(404);
                });

                it('Should fail when fromUser in different org', async () => {
                    const response = await admin.patch(
                        `${apiUrl}/org/user/${SEED_ORG_2_ADMIN.user_uuid}/reassign-schedulers`,
                        {
                            newOwnerUserUuid: SEED_ORG_1_EDITOR.user_uuid,
                        },
                        { failOnStatusCode: false },
                    );
                    expect(response.status).toBe(404);
                });

                it('Should fail when new owner in different org', async () => {
                    const response = await admin.patch(
                        `${apiUrl}/org/user/${SEED_ORG_1_ADMIN.user_uuid}/reassign-schedulers`,
                        {
                            newOwnerUserUuid: SEED_ORG_2_ADMIN.user_uuid,
                        },
                        { failOnStatusCode: false },
                    );
                    expect(response.status).toBe(404);
                });

                it('Should fail when new owner is viewer', async () => {
                    const response = await admin.patch(
                        `${apiUrl}/org/user/${SEED_ORG_1_ADMIN.user_uuid}/reassign-schedulers`,
                        {
                            newOwnerUserUuid: SEED_ORG_1_VIEWER.user_uuid,
                        },
                        { failOnStatusCode: false },
                    );
                    expect(response.status).toBe(403);
                });

                it('Should fail as viewer', async () => {
                    const viewer = await loginAsViewer();
                    const response = await viewer.patch(
                        `${apiUrl}/org/user/${SEED_ORG_1_ADMIN.user_uuid}/reassign-schedulers`,
                        {
                            newOwnerUserUuid: SEED_ORG_1_EDITOR.user_uuid,
                        },
                        { failOnStatusCode: false },
                    );
                    expect(response.status).toBe(403);
                });
            });
        });
    });
});
