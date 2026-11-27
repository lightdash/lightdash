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
import { ProjectTableName } from '../../database/entities/projects';
import {
    SchedulerBigQueryAttemptsTableName,
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

    const createScheduler = (
        name: string,
        format = SchedulerFormat.IMAGE,
        cron = '0 0 * * *',
        timezone?: string,
    ) =>
        model.createScheduler({
            name: `Attention fixture ${name}`,
            dashboardUuid,
            savedChartUuid: null,
            savedSqlUuid: null,
            appUuid: null,
            appName: null,
            createdBy: SEED_ORG_1_ADMIN.user_uuid,
            format,
            cron,
            timezone,
            options: {},
            enabled: true,
            includeLinks: true,
            targets: [],
        });

    const getPage = (page: number) =>
        model.getSchedulers({
            organizationUuid: SEED_ORG_1.organization_uuid,
            projectUuid: SEED_PROJECT.project_uuid,
            searchQuery: 'Attention fixture',
            filters: { needsAttention: true },
            paginateArgs: { page, pageSize: 1 },
        });

    it('filters before paginating and preserves the first automatic disable reason', async () => {
        await createScheduler('active');
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

    describe('missing BigQuery tables', () => {
        const day = (offset: number) => new Date(Date.UTC(2025, 0, 1 + offset));
        const missingTable = 'warehouse.analytics.orders';

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
            const result = await transaction.raw<{
                rows: Array<{ payload: SheetsFailureNoticePayload }>;
            }>(
                'SELECT payload FROM graphile_worker.jobs WHERE key LIKE ? ORDER BY key',
                [`sheets-notice:${schedulerUuid}:%`],
            );
            return result.rows.map((row) => row.payload);
        };

        it.each([
            { cron: '0 0 * * *', days: [0, 1, 2, 3, 4, 5, 6, 7] },
            { cron: '0 0 * * 3', days: [0, 7, 14, 21, 28] },
        ])(
            'requires five consecutive failures and seven elapsed days ($cron)',
            async ({ cron, days }) => {
                await createScheduler('active');
                const { schedulerUuid } = await createScheduler(
                    'waiting',
                    SchedulerFormat.GSHEETS,
                    cron,
                    'UTC',
                );
                const record = (offset: number) =>
                    model.recordBigQueryTableOutcome(
                        schedulerUuid,
                        day(offset),
                        missingTable,
                    );
                const lastDay = days[days.length - 1];
                for (const offset of days.slice(0, -1)) {
                    // eslint-disable-next-line no-await-in-loop
                    expect(await record(offset)).toBe('warning');
                }
                const page = await getPage(1);
                expect(page.pagination).toMatchObject({ totalResults: 1 });
                expect(page.data).toMatchObject([
                    {
                        schedulerUuid,
                        enabled: true,
                        missingTableWarning: {
                            firstFailedAt: day(0),
                            consecutiveFailures: days.length - 1,
                        },
                    },
                ]);

                expect(await record(lastDay)).toBe('paused');
                expect(await record(lastDay)).toBe('none');
                expect(await record(lastDay + 1)).toBe('none');
                const [paused] = (await getPage(1)).data;
                expect(paused.enabled).toBe(false);
                expect(paused.automaticallyDisabledReason).toContain(
                    'BigQuery',
                );
                expect(paused.automaticallyDisabledReason).not.toContain(
                    missingTable,
                );
                expect(paused.missingTableWarning).toBeUndefined();
                const notices = await getNotices(schedulerUuid);
                expect(
                    await transaction('graphile_worker.jobs')
                        .whereLike('key', `sheets-notice:${schedulerUuid}:%`)
                        .distinct()
                        .pluck('task_identifier'),
                ).toEqual([SCHEDULER_TASKS.NOTIFY_SHEETS_FAILURE]);
                expect(notices.map((n) => n.channel)).toEqual([
                    'email',
                    'slack',
                ]);
                expect(
                    notices.every(
                        (n) =>
                            n.event.type === 'paused' &&
                            n.event.scheduledTime ===
                                day(lastDay).toISOString(),
                    ),
                ).toBe(true);
            },
        );

        it('starts again after a gap and ignores its late successful completion', async () => {
            const { schedulerUuid } = await createScheduler(
                'gap',
                SchedulerFormat.GSHEETS,
                '0 * * * *',
                'UTC',
            );
            const hour = (value: number) =>
                new Date(Date.UTC(2025, 0, 1, value));
            const record = (value: number, table: string | null) =>
                model.recordBigQueryTableOutcome(
                    schedulerUuid,
                    hour(value),
                    table,
                );
            await record(0, missingTable);
            await record(1, missingTable);
            await record(3, missingTable);
            await record(2, null);
            await record(4, missingTable);
            expect((await getPage(1)).data[0].missingTableWarning).toEqual({
                firstFailedAt: hour(3),
                consecutiveFailures: 2,
            });
        });

        it('uses the project timezone for consecutive occurrences across DST', async () => {
            await transaction(ProjectTableName)
                .where('project_uuid', SEED_PROJECT.project_uuid)
                .update({ scheduler_timezone: 'Europe/Madrid' });
            const { schedulerUuid } = await createScheduler(
                'timezone',
                SchedulerFormat.GSHEETS,
                '0 9 * * *',
            );
            const before = new Date('2025-03-29T08:00:00Z');
            const after = new Date('2025-03-30T07:00:00Z');
            await model.recordBigQueryTableOutcome(
                schedulerUuid,
                before,
                missingTable,
            );
            await model.recordBigQueryTableOutcome(
                schedulerUuid,
                after,
                missingTable,
            );
            expect((await getPage(1)).data[0].missingTableWarning).toEqual({
                firstFailedAt: before,
                consecutiveFailures: 2,
            });
        });

        it('deduplicates source attempts after delivered notices leave the queue and prunes terminal occurrences', async () => {
            const { schedulerUuid } = await createScheduler(
                'attempts',
                SchedulerFormat.GSHEETS,
            );
            const recordAttempt = (
                jobId: string,
                attempt: number,
                when: Date,
            ) =>
                model.enqueueBigQueryTableAttempt(
                    schedulerUuid,
                    jobId,
                    attempt,
                    when,
                );
            const completeNotices = () =>
                transaction('graphile_worker.jobs')
                    .whereLike('key', `sheets-notice:${schedulerUuid}:%`)
                    .delete();
            const expectAttempt = async (jobId: string, attempt: number) =>
                expect(await getNotices(schedulerUuid)).toEqual(
                    ['email', 'slack'].map((channel) => ({
                        schedulerUuid,
                        channel,
                        event: { type: 'attempt', jobId, attempt },
                    })),
                );
            const pending = () =>
                transaction(SchedulerBigQueryAttemptsTableName)
                    .where('scheduler_uuid', schedulerUuid)
                    .orderBy('source_job_id')
                    .pluck('source_job_id');

            await recordAttempt('123', 1, day(0));
            await expectAttempt('123', 1);
            expect(
                await transaction('graphile_worker.jobs')
                    .whereLike('key', `sheets-notice:${schedulerUuid}:%`)
                    .distinct()
                    .pluck('task_identifier'),
            ).toEqual([SCHEDULER_TASKS.NOTIFY_SHEETS_MISSING_TABLE_ATTEMPT]);
            await completeNotices();
            await recordAttempt('123', 1, day(0));
            expect(await getNotices(schedulerUuid)).toEqual([]);
            await recordAttempt('123', 2, day(0));
            await recordAttempt('123', 1, day(0));
            await expectAttempt('123', 2);
            await completeNotices();

            await recordAttempt('456', 1, day(1));
            expect(await pending()).toEqual(['123', '456']);
            await model.recordBigQueryTableOutcome(
                schedulerUuid,
                day(0),
                missingTable,
            );
            expect(await pending()).toEqual(['456']);
            await completeNotices();
            await recordAttempt('123', 2, day(0));
            await recordAttempt('123', 3, day(0));
            await recordAttempt('456', 1, day(1));
            expect(await getNotices(schedulerUuid)).toEqual([]);

            await model.setSchedulerEnabled(schedulerUuid, false);
            expect(await pending()).toEqual([]);
            await recordAttempt('456', 2, day(1));
            await model.setSchedulerEnabled(schedulerUuid, true);
            await recordAttempt('456', 2, day(1));
            expect(await getNotices(schedulerUuid)).toEqual([]);
            expect(await pending()).toEqual([]);
        });

        it('removes only future unlocked scheduled jobs and their pending log entries on pause', async () => {
            const { schedulerUuid } = await createScheduler(
                'cleanup',
                SchedulerFormat.GSHEETS,
                '0 0 * * 3',
                'UTC',
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
            const due = await addJob(`${prefix}due`, day(0));
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
            for (const offset of [0, 7, 14, 21, 28]) {
                // eslint-disable-next-line no-await-in-loop
                await model.recordBigQueryTableOutcome(
                    schedulerUuid,
                    day(offset),
                    missingTable,
                );
            }
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

        it('resets on another table, recovery, and manual pause/resume, ignoring old occurrences', async () => {
            const { schedulerUuid } = await createScheduler(
                'reset',
                SchedulerFormat.GSHEETS,
            );
            const record = (offset: number, table: string | null) =>
                model.recordBigQueryTableOutcome(
                    schedulerUuid,
                    day(offset),
                    table,
                );

            expect(await record(0, missingTable)).toBe('warning');
            expect(await record(1, 'other_table')).toBe('warning');
            expect(await record(1, null)).toBe('none');
            expect(await record(0, missingTable)).toBe('none');
            expect((await getPage(1)).data[0].missingTableWarning).toEqual({
                firstFailedAt: day(1),
                consecutiveFailures: 1,
            });
            expect(await record(2, null)).toBe('none');
            expect(await record(1, missingTable)).toBe('none');
            expect((await getPage(1)).data).toHaveLength(0);

            expect(await record(3, missingTable)).toBe('warning');
            await model.setSchedulerEnabled(schedulerUuid, false);
            expect((await getPage(1)).data).toHaveLength(0);
            expect(await record(4, missingTable)).toBe('none');
            await model.setSchedulerEnabled(schedulerUuid, true);
            expect(await record(5, missingTable)).toBe('none');

            const afterResume = new Date(Date.now() + 60_000);
            expect(
                await model.recordBigQueryTableOutcome(
                    schedulerUuid,
                    afterResume,
                    missingTable,
                ),
            ).toBe('warning');
            expect((await getPage(1)).data[0].missingTableWarning).toEqual({
                firstFailedAt: afterResume,
                consecutiveFailures: 1,
            });
        });
    });
});
