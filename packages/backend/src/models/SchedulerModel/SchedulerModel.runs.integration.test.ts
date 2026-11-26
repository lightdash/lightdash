import {
    SchedulerFormat,
    SchedulerJobStatus,
    SchedulerRunStatus,
} from '@lightdash/common';
import { DashboardsTableName } from '../../database/entities/dashboards';
import { ProjectTableName } from '../../database/entities/projects';
import {
    SchedulerLogTableName,
    SchedulerTableName,
} from '../../database/entities/scheduler';
import { SpaceTableName } from '../../database/entities/spaces';
import { getTestContext } from '../../vitest.setup.integration';
import { SchedulerModel } from './index';

const FIXTURE_SLUG = 'prod-13521-runs-fixture';
const JOB_PREFIX = 'prod13521-runs-test-';
const TASK = 'handleScheduledDelivery';

const now = Date.now();
const minutesAgo = (minutes: number) => new Date(now - minutes * 60 * 1000);

describe('SchedulerModel.getRunsForSchedulers', () => {
    let schedulerUuid: string;

    const deleteFixtures = async () => {
        const { db } = getTestContext();
        await db(SchedulerLogTableName)
            .where('job_id', 'like', `${JOB_PREFIX}%`)
            .delete();
        await db(SchedulerTableName).where('slug', FIXTURE_SLUG).delete();
        await db(DashboardsTableName).where('slug', FIXTURE_SLUG).delete();
        await db(SpaceTableName).where('slug', FIXTURE_SLUG).delete();
    };

    beforeEach(async () => {
        await deleteFixtures();
        const { db, testProjectUuid, testUser } = getTestContext();
        const project = await db(ProjectTableName)
            .where('project_uuid', testProjectUuid)
            .select('project_id')
            .first();
        if (!project) {
            throw new Error(`Test project ${testProjectUuid} is missing`);
        }
        const [space] = await db(SpaceTableName)
            .insert({
                project_id: project.project_id,
                name: 'PROD-13521 runs fixture',
                slug: FIXTURE_SLUG,
                path: 'prod_13521_runs_fixture',
                parent_space_uuid: null,
                inherit_parent_permissions: false,
                is_default_user_space: false,
            })
            .returning('space_id');
        const [dashboard] = await db(DashboardsTableName)
            .insert({
                space_id: space.space_id,
                name: 'PROD-13521 runs fixture',
                slug: FIXTURE_SLUG,
                project_uuid: testProjectUuid,
            })
            .returning('dashboard_uuid');
        const [scheduler] = await db(SchedulerTableName)
            .insert({
                name: 'PROD-13521 runs fixture',
                created_by: testUser.userUuid,
                updated_at: new Date(),
                cron: '0 9 * * *',
                timezone: null,
                dashboard_uuid: dashboard.dashboard_uuid,
                saved_chart_uuid: null,
                saved_sql_uuid: null,
                app_uuid: null,
                format: SchedulerFormat.GSHEETS,
                options: {},
                custom_viewport_width: null,
                enabled: true,
                notification_frequency: null,
                selected_tabs: null,
                include_links: true,
                plain_text_email: false,
                use_cached_results: false,
                filters: null,
                parameters: null,
                thresholds: null,
                app_state: null,
                project_uuid: testProjectUuid,
                slug: FIXTURE_SLUG,
            })
            .returning('scheduler_uuid');
        schedulerUuid = scheduler.scheduler_uuid;
    });

    afterEach(deleteFixtures);

    const insertRun = async (
        runId: string,
        scheduledTime: Date,
        childDetails: Record<string, unknown>,
    ) => {
        const { db } = getTestContext();
        const parent = `${JOB_PREFIX}${runId}`;
        const base = {
            scheduler_uuid: schedulerUuid,
            scheduled_time: scheduledTime,
            target: null,
            target_type: null,
        };
        const rows = [
            {
                ...base,
                job_id: parent,
                job_group: parent,
                task: TASK,
                status: SchedulerJobStatus.COMPLETED,
                created_at: scheduledTime,
                details: {},
            },
            {
                ...base,
                job_id: `${parent}-upload`,
                job_group: parent,
                task: 'uploadGsheets',
                status: SchedulerJobStatus.STARTED,
                created_at: new Date(scheduledTime.getTime() + 1_000),
                details: {},
            },
            {
                ...base,
                job_id: `${parent}-upload`,
                job_group: parent,
                task: 'uploadGsheets',
                status: SchedulerJobStatus.ERROR,
                created_at: new Date(scheduledTime.getTime() + 2_000),
                details: childDetails,
            },
        ];
        await db(SchedulerLogTableName).insert(rows);
    };

    it('does not count a superseded Google Sheets run as a failure', async () => {
        await insertRun('superseded', minutesAgo(20), {
            error: 'A newer run took over the tab "Sheet1", so this run stopped.',
            superseded: true,
        });
        await insertRun('failed', minutesAgo(10), { error: 'Google error' });
        const { db } = getTestContext();

        const runs = await new SchedulerModel({
            database: db,
        }).getRunsForSchedulers({
            schedulers: [
                {
                    schedulerUuid,
                    name: 'PROD-13521 runs fixture',
                    createdBy: 'unused',
                    targets: [],
                },
            ] as never,
        });

        const byId = Object.fromEntries(
            runs.data.map((run) => [run.runId.replace(JOB_PREFIX, ''), run]),
        );
        expect(byId.superseded.runStatus).toBe(SchedulerRunStatus.COMPLETED);
        expect(byId.superseded.logCounts.error).toBe(0);
        expect(byId.failed.runStatus).toBe(SchedulerRunStatus.PARTIAL_FAILURE);
        expect(byId.failed.logCounts.error).toBe(1);
    });
});
