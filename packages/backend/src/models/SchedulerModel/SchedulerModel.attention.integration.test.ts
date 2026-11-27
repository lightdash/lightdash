import {
    SCHEDULER_TASKS,
    SchedulerFormat,
    SchedulerJobStatus,
    SEED_ORG_1,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
    type SheetsFailureNoticePayload,
} from '@lightdash/common';
import { runMigrations as runGraphileMigrations } from 'graphile-worker';
import knex, { type Knex } from 'knex';
import { Pool } from 'pg';
import { DashboardsTableName } from '../../database/entities/dashboards';
import {
    SchedulerLogTableName,
    SchedulerTableName,
} from '../../database/entities/scheduler';
import { SchedulerModel } from './index';

describe('SchedulerModel automatically disabled deliveries', () => {
    let database: Knex;
    let transaction: Knex.Transaction;
    let model: SchedulerModel;
    let dashboardUuid: string;

    beforeAll(async () => {
        if (!process.env.PGDATABASE && !process.env.PGCONNECTIONURI) {
            throw new Error('Set a seeded PostgreSQL database for this test');
        }
        database = knex({
            client: 'pg',
            connection: process.env.PGCONNECTIONURI ?? {
                host: process.env.PGHOST,
                port: Number(process.env.PGPORT ?? 5432),
                user: process.env.PGUSER,
                password: process.env.PGPASSWORD,
                database: process.env.PGDATABASE,
            },
            pool: { min: 0, max: 1 },
        });
        const dashboard = await database(DashboardsTableName)
            .where({
                project_uuid: SEED_PROJECT.project_uuid,
                slug: 'jaffle-dashboard',
            })
            .first('dashboard_uuid');
        if (!dashboard) throw new Error('Seeded Jaffle dashboard is missing');
        dashboardUuid = dashboard.dashboard_uuid;
    });

    beforeEach(async () => {
        transaction = await database.transaction();
        model = new SchedulerModel({ database: transaction });
    });

    afterEach(async () => {
        await transaction?.rollback();
    });

    afterAll(async () => {
        await database?.destroy();
    });

    const createScheduler = (name: string, format = SchedulerFormat.IMAGE) =>
        model.createScheduler({
            name: `Attention fixture ${name}`,
            dashboardUuid,
            savedChartUuid: null,
            savedSqlUuid: null,
            appUuid: null,
            appName: null,
            createdBy: SEED_ORG_1_ADMIN.user_uuid,
            format,
            cron: '0 9 * * *',
            options: {},
            enabled: true,
            includeLinks: true,
            targets: [],
        });

    const getPage = (
        page: number,
        filters: { needsAttention?: boolean; enabled?: boolean } = {
            needsAttention: true,
        },
    ) =>
        model.getSchedulers({
            organizationUuid: SEED_ORG_1.organization_uuid,
            projectUuid: SEED_PROJECT.project_uuid,
            searchQuery: 'Attention fixture',
            filters,
            paginateArgs: { page, pageSize: 1 },
        });

    it('filters before paginating and preserves the first automatic disable reason', async () => {
        const active = await createScheduler('active');
        const paused = await createScheduler('manually paused');
        const first = await createScheduler('report A');
        const second = await createScheduler('report B');
        const missingRecipients =
            'The delivery has no recipients or destinations.';
        const disconnected = 'The Slack workspace is disconnected.';

        await model.setSchedulerEnabled(paused.schedulerUuid, false);
        await model.setSchedulerEnabled(
            paused.schedulerUuid,
            false,
            disconnected,
        );
        await model.setSchedulerEnabled(
            first.schedulerUuid,
            false,
            missingRecipients,
        );
        await model.setSchedulerEnabled(
            first.schedulerUuid,
            false,
            disconnected,
        );
        await model.setSchedulerEnabled(
            second.schedulerUuid,
            false,
            disconnected,
        );

        const enabledPage = await getPage(1, { enabled: true });
        expect(enabledPage.pagination).toMatchObject({ totalResults: 1 });
        expect(enabledPage.data[0].schedulerUuid).toBe(active.schedulerUuid);

        const disabledPage = await getPage(1, { enabled: false });
        expect(disabledPage.pagination).toMatchObject({
            totalResults: 3,
            totalPageCount: 3,
        });
        expect(disabledPage.data[0].schedulerUuid).toBe(paused.schedulerUuid);
        expect(
            (await getPage(3, { enabled: false })).data[0].schedulerUuid,
        ).toBe(second.schedulerUuid);

        const firstPage = await getPage(1);
        expect(firstPage.pagination).toMatchObject({
            totalResults: 2,
            totalPageCount: 2,
        });
        expect(firstPage.data).toMatchObject([
            {
                schedulerUuid: first.schedulerUuid,
                enabled: false,
                automaticallyDisabledReason: missingRecipients,
            },
        ]);
        expect((await getPage(2)).data).toMatchObject([
            {
                schedulerUuid: second.schedulerUuid,
                automaticallyDisabledReason: disconnected,
            },
        ]);
    });

    it('clears the reason on manual re-enable', async () => {
        const { schedulerUuid } = await createScheduler('restored');
        await model.setSchedulerEnabled(
            schedulerUuid,
            false,
            'The Slack workspace is disconnected.',
        );
        await model.setSchedulerEnabled(schedulerUuid, true);

        const row = await transaction(SchedulerTableName)
            .where('scheduler_uuid', schedulerUuid)
            .first('enabled', 'automatically_disabled_reason');
        expect(row).toEqual({
            enabled: true,
            automatically_disabled_reason: null,
        });
        expect((await getPage(1)).data).toEqual([]);
    });

    describe('permanent Google Sheets errors', () => {
        const reason =
            'Configuration required by this Google Sheets sync is missing.';
        beforeAll(async () => {
            const pool = new Pool({
                connectionString: process.env.PGCONNECTIONURI,
            });
            try {
                await runGraphileMigrations({ pgPool: pool });
            } finally {
                await pool.end();
            }
        });
        const getNotices = async (schedulerUuid: string) => {
            const { rows } = await transaction.raw<{
                rows: Array<{ payload: SheetsFailureNoticePayload }>;
            }>(
                'SELECT payload FROM graphile_worker.jobs WHERE key LIKE ? ORDER BY key',
                [`sheets-notice:${schedulerUuid}:%`],
            );
            return rows.map(({ payload }) => payload);
        };
        const pauseContext = (schedulerUuid: string, scheduledTime: Date) => ({
            schedulerUuid,
            scheduledTime,
            reason,
            ownerUuid: SEED_ORG_1_ADMIN.user_uuid,
            projectUuid: SEED_PROJECT.project_uuid,
            organizationUuid: SEED_ORG_1.organization_uuid,
        });

        it('queues each channel only on the enabled-to-paused transition, including after notice jobs have completed', async () => {
            const { schedulerUuid } = await createScheduler(
                'permanent error',
                SchedulerFormat.GSHEETS,
            );
            const due = new Date('2025-04-01T09:00:00Z');
            await transaction(SchedulerTableName)
                .where('scheduler_uuid', schedulerUuid)
                .update({
                    created_by: SEED_ORG_1_ADMIN.user_uuid,
                    updated_at: new Date('2025-03-31T08:00:00Z'),
                });
            const context = pauseContext(schedulerUuid, due);
            const otherUuid = '00000000-0000-4000-8000-000000000001';
            for (const field of [
                'organizationUuid',
                'projectUuid',
                'ownerUuid',
            ] as const) {
                // eslint-disable-next-line no-await-in-loop
                await model.pauseScheduledSheetsForError({
                    ...context,
                    [field]: otherUuid,
                });
            }
            expect(await getNotices(schedulerUuid)).toEqual([]);
            await model.pauseScheduledSheetsForError(context);
            const event = {
                type: 'paused',
                scheduledTime: due.toISOString(),
                reason,
            };
            expect(await getNotices(schedulerUuid)).toEqual([
                { schedulerUuid, event, channel: 'email' },
                { schedulerUuid, event, channel: 'slack' },
            ]);
            expect((await getPage(1)).data).toMatchObject([
                {
                    schedulerUuid,
                    enabled: false,
                    automaticallyDisabledReason: reason,
                },
            ]);
            await transaction('graphile_worker.jobs')
                .where('key', 'like', `sheets-notice:${schedulerUuid}:%`)
                .delete();
            await model.pauseScheduledSheetsForError(context);
            expect(await getNotices(schedulerUuid)).toEqual([]);
            await model.setSchedulerEnabled(schedulerUuid, true);
            await model.pauseScheduledSheetsForError(context);
            expect((await model.getScheduler(schedulerUuid)).enabled).toBe(
                true,
            );
            expect(await getNotices(schedulerUuid)).toEqual([]);
        });

        it('queues an authorized legacy automatic pause once and stays silent on manual disable', async () => {
            const { schedulerUuid } = await createScheduler(
                'legacy error',
                SchedulerFormat.GSHEETS,
            );
            await model.setSchedulerEnabled(schedulerUuid, false);
            expect(await getNotices(schedulerUuid)).toEqual([]);
            await model.setSchedulerEnabled(schedulerUuid, true);
            await model.setSchedulerEnabled(schedulerUuid, false, reason);
            await model.setSchedulerEnabled(schedulerUuid, false, reason);
            expect(
                (await getNotices(schedulerUuid)).map(({ channel }) => channel),
            ).toEqual(['email', 'slack']);
        });
        it('removes only future unlocked scheduled jobs and their pending log entries on pause', async () => {
            const { schedulerUuid } = await createScheduler(
                'cleanup',
                SchedulerFormat.GSHEETS,
            );
            const prefix = `scheduler:${schedulerUuid}:`;
            const addJob = async (
                key: string,
                date: Date,
                scheduled = true,
            ) => {
                const {
                    rows: [job],
                } = await transaction.raw<{ rows: Array<{ id: string }> }>(
                    'SELECT id::text FROM graphile_worker.add_job(?, ?::json, run_at => ?, job_key => ?)',
                    [
                        SCHEDULER_TASKS.HANDLE_SCHEDULED_DELIVERY,
                        JSON.stringify(
                            scheduled
                                ? { cronScheduledAt: date.toISOString() }
                                : {},
                        ),
                        date,
                        key,
                    ],
                );
                await transaction(SchedulerLogTableName).insert({
                    task: SCHEDULER_TASKS.HANDLE_SCHEDULED_DELIVERY,
                    scheduler_uuid: schedulerUuid,
                    job_id: job.id,
                    job_group: job.id,
                    scheduled_time: date,
                    status: SchedulerJobStatus.SCHEDULED,
                    target: null,
                    target_type: null,
                    details: null,
                });
                return job.id;
            };
            const future = new Date(Date.now() + 3_600_000);
            const removed = await addJob(`${prefix}future`, future);
            const locked = await addJob(`${prefix}locked`, future);
            await transaction('graphile_worker.jobs')
                .where('id', locked)
                .update({ locked_at: new Date(), locked_by: 'active-worker' });
            const manual = await addJob(`${prefix}manual`, future, false);
            const due = await addJob(
                `${prefix}due`,
                new Date('2025-04-01T09:00:00Z'),
            );
            await transaction(SchedulerLogTableName).insert({
                task: SCHEDULER_TASKS.HANDLE_SCHEDULED_DELIVERY,
                scheduler_uuid: schedulerUuid,
                job_id: removed,
                job_group: removed,
                scheduled_time: future,
                status: SchedulerJobStatus.STARTED,
                target: null,
                target_type: null,
                details: null,
            });
            await model.pauseScheduledSheetsForError(
                pauseContext(schedulerUuid, new Date(Date.now() + 1000)),
            );
            const retained = [locked, manual, due];
            const remaining = await transaction('graphile_worker.jobs')
                .whereIn('id', [removed, ...retained])
                .pluck('id');
            expect(remaining.map(String).sort()).toEqual(retained.sort());
            const scheduledLogs = await transaction(SchedulerLogTableName)
                .where('scheduler_uuid', schedulerUuid)
                .where('status', SchedulerJobStatus.SCHEDULED)
                .pluck('job_id');
            expect(scheduledLogs.sort()).toEqual(retained);
            expect(
                await transaction(SchedulerLogTableName)
                    .where({
                        job_id: removed,
                        status: SchedulerJobStatus.STARTED,
                    })
                    .first(),
            ).toBeDefined();
        });
    });
});
