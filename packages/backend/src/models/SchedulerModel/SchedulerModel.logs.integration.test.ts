import { SchedulerFormat, SchedulerJobStatus } from '@lightdash/common';
import { DashboardsTableName } from '../../database/entities/dashboards';
import { ProjectTableName } from '../../database/entities/projects';
import {
    SchedulerLogTableName,
    SchedulerTableName,
} from '../../database/entities/scheduler';
import { SpaceTableName } from '../../database/entities/spaces';
import { getTestContext } from '../../vitest.setup.integration';
import { SchedulerModel } from './index';

const FIXTURE_SLUG = 'prod-12401-logs-fixture';
const JOB_PREFIX = 'prod12401-logs-test-';
const TASK = 'handleScheduledDelivery';

const now = Date.now();
const minutesAgo = (minutes: number) => new Date(now - minutes * 60 * 1000);

type LogRow = {
    jobId: string;
    status: SchedulerJobStatus;
    scheduledTime: Date;
    createdAt: Date;
};

describe('SchedulerModel.getSchedulerLogs', () => {
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

    const insertLogs = async (rows: LogRow[]) => {
        const { db } = getTestContext();
        await db(SchedulerLogTableName).insert(
            rows.map((row) => ({
                job_id: `${JOB_PREFIX}${row.jobId}`,
                job_group: `${JOB_PREFIX}${row.jobId}`,
                task: TASK,
                scheduler_uuid: schedulerUuid,
                status: row.status,
                scheduled_time: row.scheduledTime,
                created_at: row.createdAt,
                target: null,
                target_type: null,
                details: {},
            })),
        );
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
                name: 'PROD-12401 logs fixture',
                slug: FIXTURE_SLUG,
                path: 'prod_12401_logs_fixture',
                parent_space_uuid: null,
                inherit_parent_permissions: false,
                is_default_user_space: false,
            })
            .returning('space_id');
        const [dashboard] = await db(DashboardsTableName)
            .insert({
                space_id: space.space_id,
                name: 'PROD-12401 logs fixture',
                slug: FIXTURE_SLUG,
                project_uuid: testProjectUuid,
            })
            .returning('dashboard_uuid');
        const [scheduler] = await db(SchedulerTableName)
            .insert({
                name: 'PROD-12401 logs fixture',
                created_by: testUser.userUuid,
                updated_at: new Date(),
                cron: '0 9 * * *',
                timezone: null,
                dashboard_uuid: dashboard.dashboard_uuid,
                saved_chart_uuid: null,
                saved_sql_uuid: null,
                app_uuid: null,
                format: SchedulerFormat.IMAGE,
                options: {},
                custom_viewport_width: null,
                enabled: true,
                notification_frequency: null,
                selected_tabs: null,
                include_links: true,
                plain_text_email: false,
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

    const getLogs = (args: {
        page: number;
        pageSize: number;
        statuses?: SchedulerJobStatus[];
    }) => {
        const { db, testProjectUuid } = getTestContext();
        return new SchedulerModel({ database: db }).getSchedulerLogs({
            projectUuid: testProjectUuid,
            paginateArgs: { page: args.page, pageSize: args.pageSize },
            filters: args.statuses ? { statuses: args.statuses } : undefined,
        });
    };

    it('shows each job status once, keeping the latest occurrence', async () => {
        await insertLogs([
            {
                jobId: 'a',
                status: SchedulerJobStatus.SCHEDULED,
                scheduledTime: minutesAgo(10),
                createdAt: minutesAgo(10),
            },
            {
                jobId: 'a',
                status: SchedulerJobStatus.COMPLETED,
                scheduledTime: minutesAgo(10),
                createdAt: minutesAgo(9),
            },
            {
                jobId: 'a',
                status: SchedulerJobStatus.COMPLETED,
                scheduledTime: minutesAgo(10),
                createdAt: minutesAgo(8),
            },
        ]);

        const result = await getLogs({ page: 1, pageSize: 10 });

        expect(result.pagination?.totalResults).toBe(2);
        expect(
            result.data.logs.map((log) => [log.status, log.createdAt]),
        ).toEqual([
            [SchedulerJobStatus.COMPLETED, minutesAgo(8)],
            [SchedulerJobStatus.SCHEDULED, minutesAgo(10)],
        ]);
    });

    it('orders by newest scheduled time, then error before completed, started and scheduled', async () => {
        const sameTime = minutesAgo(30);
        await insertLogs([
            {
                jobId: 'old-scheduled',
                status: SchedulerJobStatus.SCHEDULED,
                scheduledTime: sameTime,
                createdAt: sameTime,
            },
            {
                jobId: 'old-started',
                status: SchedulerJobStatus.STARTED,
                scheduledTime: sameTime,
                createdAt: sameTime,
            },
            {
                jobId: 'old-completed',
                status: SchedulerJobStatus.COMPLETED,
                scheduledTime: sameTime,
                createdAt: sameTime,
            },
            {
                jobId: 'old-error',
                status: SchedulerJobStatus.ERROR,
                scheduledTime: sameTime,
                createdAt: sameTime,
            },
            {
                jobId: 'new',
                status: SchedulerJobStatus.SCHEDULED,
                scheduledTime: minutesAgo(5),
                createdAt: minutesAgo(5),
            },
        ]);

        const result = await getLogs({ page: 1, pageSize: 10 });

        expect(result.data.logs.map((log) => log.jobId)).toEqual([
            `${JOB_PREFIX}new`,
            `${JOB_PREFIX}old-error`,
            `${JOB_PREFIX}old-completed`,
            `${JOB_PREFIX}old-started`,
            `${JOB_PREFIX}old-scheduled`,
        ]);
    });

    it('pages through deduplicated logs with stable totals', async () => {
        await insertLogs(
            Array.from({ length: 7 }, (_, index) => ({
                jobId: `job-${index}`,
                status: SchedulerJobStatus.COMPLETED,
                scheduledTime: minutesAgo(index + 1),
                createdAt: minutesAgo(index + 1),
            })),
        );
        await insertLogs([
            {
                jobId: 'job-0',
                status: SchedulerJobStatus.COMPLETED,
                scheduledTime: minutesAgo(1),
                createdAt: minutesAgo(0.5),
            },
        ]);

        const firstPage = await getLogs({ page: 1, pageSize: 3 });
        const lastPage = await getLogs({ page: 3, pageSize: 3 });

        expect(firstPage.pagination).toEqual({
            page: 1,
            pageSize: 3,
            totalPageCount: 3,
            totalResults: 7,
        });
        expect(firstPage.data.logs.map((log) => log.jobId)).toEqual([
            `${JOB_PREFIX}job-0`,
            `${JOB_PREFIX}job-1`,
            `${JOB_PREFIX}job-2`,
        ]);
        expect(lastPage.data.logs.map((log) => log.jobId)).toEqual([
            `${JOB_PREFIX}job-6`,
        ]);
    });

    it('only counts logs matching the status filter', async () => {
        await insertLogs([
            {
                jobId: 'x',
                status: SchedulerJobStatus.ERROR,
                scheduledTime: minutesAgo(3),
                createdAt: minutesAgo(3),
            },
            {
                jobId: 'y',
                status: SchedulerJobStatus.COMPLETED,
                scheduledTime: minutesAgo(2),
                createdAt: minutesAgo(2),
            },
        ]);

        const result = await getLogs({
            page: 1,
            pageSize: 10,
            statuses: [SchedulerJobStatus.ERROR],
        });

        expect(result.pagination?.totalResults).toBe(1);
        expect(result.data.logs.map((log) => log.status)).toEqual([
            SchedulerJobStatus.ERROR,
        ]);
    });
});
