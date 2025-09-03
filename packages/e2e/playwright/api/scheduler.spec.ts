import { test, expect } from '@playwright/test';
import {
    ChartScheduler,
    CreateSchedulerAndTargetsWithoutIds,
    DashboardScheduler,
    SchedulerFormat,
    SchedulerSlackTarget,
    SEED_PROJECT,
    UpdateSchedulerAndTargetsWithoutId,
} from '@lightdash/common';
import { login } from '../support/auth';

const apiUrl = '/api/v1';

const cron = '59 23 * * *';
const createSchedulerBody: CreateSchedulerAndTargetsWithoutIds = {
    name: 'test',
    cron,
    targets: [{ channel: 'C1' }, { channel: 'C2' }],
    format: SchedulerFormat.IMAGE,
    options: {},
    timezone: 'UTC', // Explicitly set the timezone to be UTC since the project default might have been changed which will make the tests fail
    enabled: true,
    includeLinks: false,
};

const getUpdateSchedulerBody = (
    schedulerSlackTargetUuid: string,
): UpdateSchedulerAndTargetsWithoutId => ({
    name: 'test2',
    cron,
    targets: [{ schedulerSlackTargetUuid, channel: 'C1' }, { channel: 'C3' }],
    format: SchedulerFormat.IMAGE,
    options: {},
    includeLinks: false,
});

test.describe('Lightdash scheduler endpoints', () => {
    test.beforeEach(async ({ request }) => {
        await login(request);
    });
    
    test('Should create/update/delete chart scheduler', async ({ request }) => {
        const projectUuid = SEED_PROJECT.project_uuid;
        
        // Get charts
        const projectResponse = await request.get(`${apiUrl}/projects/${projectUuid}/charts`);
        const projectBody = await projectResponse.json();
        const savedChart = projectBody.results.find(
            (s: { name: string }) => s.name === 'How much revenue do we have per payment method?',
        );

        // Create scheduler
        const createResponse = await request.post(`${apiUrl}/saved/${savedChart.uuid}/schedulers`, {
            headers: { 'Content-type': 'application/json' },
            data: createSchedulerBody,
        });
        
        const createBody = await createResponse.json();
        expect(createBody.results).toHaveProperty('schedulerUuid');
        expect(createBody.results.savedChartUuid).toBe(savedChart.uuid);
        expect(createBody.results.targets).toHaveLength(2);

        const { schedulerUuid, targets } = createBody.results;

        // Get all chart schedulers
        const getSchedulersResponse = await request.get(`${apiUrl}/saved/${savedChart.uuid}/schedulers`);
        const getSchedulersBody = await getSchedulersResponse.json();
        const schedulerIds = getSchedulersBody.results.map((r: ChartScheduler) => r.schedulerUuid);
        expect(schedulerIds).toContain(schedulerUuid);

        // Get created jobs
        const jobsResponse = await request.get(`${apiUrl}/schedulers/${schedulerUuid}/jobs`);
        const jobsBody = await jobsResponse.json();
        expect(jobsBody.results).toHaveLength(1);
        expect(`${jobsBody.results[0].date}`.split('T')[1]).toBe('23:59:00.000Z');

        // Update scheduler
        const updateResponse = await request.patch(`${apiUrl}/schedulers/${schedulerUuid}`, {
            headers: { 'Content-type': 'application/json' },
            data: getUpdateSchedulerBody(
                (targets[0] as SchedulerSlackTarget).schedulerSlackTargetUuid,
            ),
        });
        
        const updateBody = await updateResponse.json();
        expect(updateBody.results.name).toBe('test2');
        expect(updateBody.results.cron).toBe(cron);
        expect(updateBody.results.targets).toHaveLength(2);
        expect((updateBody.results.targets[0] as SchedulerSlackTarget).channel).toBe('C1');
        expect((updateBody.results.targets[1] as SchedulerSlackTarget).channel).toBe('C3');

        // Delete scheduler
        const deleteResponse = await request.delete(`${apiUrl}/schedulers/${schedulerUuid}`);
        expect(deleteResponse.status()).toBe(200);

        // Verify jobs are deleted
        const deletedJobsResponse = await request.get(`${apiUrl}/schedulers/${schedulerUuid}/jobs`);
        expect(deletedJobsResponse.status()).toBe(404);
    });
    
    test('Should create/update/delete dashboard scheduler', async ({ request }) => {
        const projectUuid = SEED_PROJECT.project_uuid;
        
        // Get dashboards
        const projectResponse = await request.get(`${apiUrl}/projects/${projectUuid}/dashboards`);
        const projectBody = await projectResponse.json();
        const dashboard = projectBody.results.find((d: { name: string; uuid: string }) => d.name === 'Jaffle dashboard');

        // Create dashboard scheduler
        const createResponse = await request.post(`${apiUrl}/dashboards/${dashboard.uuid}/schedulers`, {
            headers: { 'Content-type': 'application/json' },
            data: createSchedulerBody,
        });
        
        const createBody = await createResponse.json();
        expect(createBody.results).toHaveProperty('schedulerUuid');
        expect(createBody.results.dashboardUuid).toBe(dashboard.uuid);
        expect(createBody.results.targets).toHaveLength(2);

        const { schedulerUuid, targets } = createBody.results;

        // Get created jobs
        const jobsResponse = await request.get(`${apiUrl}/schedulers/${schedulerUuid}/jobs`);
        const jobsBody = await jobsResponse.json();
        expect(jobsBody.results).toHaveLength(1);
        expect(`${jobsBody.results[0].date}`.split('T')[1]).toBe('23:59:00.000Z');

        // Get all dashboard schedulers
        const getSchedulersResponse = await request.get(`${apiUrl}/dashboards/${dashboard.uuid}/schedulers`);
        const getSchedulersBody = await getSchedulersResponse.json();
        const schedulerIds = getSchedulersBody.results.map((r: DashboardScheduler) => r.schedulerUuid);
        expect(schedulerIds).toContain(schedulerUuid);

        // Update scheduler
        const updateResponse = await request.patch(`${apiUrl}/schedulers/${schedulerUuid}`, {
            headers: { 'Content-type': 'application/json' },
            data: getUpdateSchedulerBody(
                (targets[0] as SchedulerSlackTarget).schedulerSlackTargetUuid,
            ),
        });
        
        const updateBody = await updateResponse.json();
        expect(updateBody.results.name).toBe('test2');
        expect(updateBody.results.cron).toBe(cron);
        expect(updateBody.results.targets).toHaveLength(2);
        expect((updateBody.results.targets[0] as SchedulerSlackTarget).channel).toBe('C1');
        expect((updateBody.results.targets[1] as SchedulerSlackTarget).channel).toBe('C3');

        // Delete scheduler
        const deleteResponse = await request.delete(`${apiUrl}/schedulers/${schedulerUuid}`);
        expect(deleteResponse.status()).toBe(200);

        // Verify jobs are deleted
        const deletedJobsResponse = await request.get(`${apiUrl}/schedulers/${schedulerUuid}/jobs`);
        expect(deletedJobsResponse.status()).toBe(404);
    });
});