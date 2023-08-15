import {
    CompileProjectPayload,
    DownloadCsvPayload,
    EmailNotificationPayload,
    isSlackTarget,
    NotificationPayloadBase,
    ScheduledDeliveryPayload,
    ScheduledJobs,
    Scheduler,
    SchedulerAndTargets,
    SchedulerEmailTarget,
    SchedulerFormat,
    SchedulerJobStatus,
    SchedulerSlackTarget,
    SlackNotificationPayload,
    ValidateProjectPayload,
} from '@lightdash/common';
import { getSchedule, stringToArray } from 'cron-converter';
import { makeWorkerUtils, WorkerUtils } from 'graphile-worker';
import moment from 'moment';
import { analytics } from '../analytics/client';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import { LightdashConfig } from '../config/parseConfig';
import Logger from '../logging/logger';
import { SchedulerModel } from '../models/SchedulerModel';

type SchedulerClientDependencies = {
    lightdashConfig: LightdashConfig;
    schedulerModel: SchedulerModel;
};

export const getDailyDatesFromCron = (
    cron: string,
    when = new Date(),
): Date[] => {
    const arr = stringToArray(cron);
    const startOfMinute = moment(when).startOf('minute').toDate(); // round down to the nearest minute so we can even process 00:00 on daily jobs
    const schedule = getSchedule(arr, startOfMinute, 'UTC');

    const tomorrow = moment(startOfMinute)
        .utc()
        .add(1, 'day')
        .startOf('day')
        .toDate();

    const dailyDates: Date[] = [];
    while (schedule.next() < tomorrow) {
        dailyDates.push(schedule.date.toJSDate());
    }

    return dailyDates;
};

export class SchedulerClient {
    lightdashConfig: LightdashConfig;

    graphileUtils: Promise<WorkerUtils>;

    schedulerModel: SchedulerModel;

    constructor({
        lightdashConfig,
        schedulerModel,
    }: SchedulerClientDependencies) {
        this.lightdashConfig = lightdashConfig;
        this.schedulerModel = schedulerModel;
        this.graphileUtils = makeWorkerUtils({
            connectionString: lightdashConfig.database.connectionUri,
        })
            .then((utils) => utils)
            .catch((e: any) => {
                Logger.error('Error migrating graphile worker', e);
                process.exit(1);
            });
    }

    async getScheduledJobs(schedulerUuid: string): Promise<ScheduledJobs[]> {
        const graphileClient = await this.graphileUtils;

        const scheduledJobs = await graphileClient.withPgClient((pgClient) =>
            pgClient.query(
                "select id, run_at from graphile_worker.jobs where payload->>'schedulerUuid' = $1",
                [schedulerUuid],
            ),
        );
        return scheduledJobs.rows.map((r) => ({
            id: r.id,
            date: r.run_at,
        }));
    }

    async deleteScheduledJobs(schedulerUuid: string): Promise<void> {
        const graphileClient = await this.graphileUtils;
        const jobsToDelete = await this.getScheduledJobs(schedulerUuid);
        Logger.info(
            `Deleting ${jobsToDelete.length} scheduled delivery jobs for scheduler ${schedulerUuid}`,
        );
        const jobIdsToDelete = jobsToDelete.map((r) => r.id);

        await graphileClient.completeJobs(jobIdsToDelete);

        jobsToDelete.forEach(({ id }) => {
            analytics.track({
                event: 'scheduler_job.deleted',
                anonymousId: LightdashAnalytics.anonymousId,
                properties: {
                    jobId: id,
                    schedulerId: schedulerUuid,
                },
            });
        });
    }

    private async addScheduledDeliveryJob(date: Date, scheduler: Scheduler) {
        const graphileClient = await this.graphileUtils;

        const payload: ScheduledDeliveryPayload = {
            schedulerUuid: scheduler.schedulerUuid,
        };
        const { id } = await graphileClient.addJob(
            'handleScheduledDelivery',
            payload,
            {
                runAt: date,
                maxAttempts: 1,
            },
        );
        analytics.track({
            event: 'scheduler_job.created',
            anonymousId: LightdashAnalytics.anonymousId,
            properties: {
                jobId: id,
                schedulerId: scheduler.schedulerUuid,
            },
        });

        return { jobId: id, date };
    }

    private async addNotificationJob(
        date: Date,
        jobGroup: string,
        scheduler: Scheduler,
        target: SchedulerSlackTarget | SchedulerEmailTarget | undefined,
        page: NotificationPayloadBase['page'],
    ) {
        const graphileClient = await this.graphileUtils;

        const getIdentifierAndPayload = (): {
            identifier: string;
            targetUuid?: string;
            type: 'slack' | 'email' | 'gsheets';
            payload: any;
        } => {
            if (scheduler.format === SchedulerFormat.GSHEETS) {
                return {
                    identifier: 'sendGsheetsNotification',
                    targetUuid: undefined,
                    type: 'gsheets',
                    payload: {
                        schedulerUuid: scheduler.schedulerUuid,
                        jobGroup,
                        scheduledTime: date,
                        page,
                    },
                };
            }
            if (target && isSlackTarget(target)) {
                return {
                    identifier: 'sendSlackNotification',
                    targetUuid: target.schedulerSlackTargetUuid,
                    type: 'slack',
                    payload: {
                        schedulerUuid: scheduler.schedulerUuid,
                        jobGroup,
                        scheduledTime: date,
                        page,
                        schedulerSlackTargetUuid:
                            target.schedulerSlackTargetUuid,
                    },
                };
            }

            return {
                identifier: 'sendEmailNotification',
                targetUuid: target?.schedulerEmailTargetUuid,
                type: 'email',
                payload: {
                    schedulerUuid: scheduler.schedulerUuid,
                    scheduledTime: date,
                    jobGroup,
                    page,
                    schedulerEmailTargetUuid: target?.schedulerEmailTargetUuid,
                },
            };
        };

        const { identifier, targetUuid, payload, type } =
            getIdentifierAndPayload();
        const { id } = await graphileClient.addJob(identifier, payload, {
            runAt: date,
            maxAttempts: 1,
        });
        analytics.track({
            event: 'scheduler_notification_job.created',
            anonymousId: LightdashAnalytics.anonymousId,
            properties: {
                jobId: id,
                schedulerId: scheduler.schedulerUuid,
                schedulerTargetId: targetUuid,
                type,
                format: scheduler.format,
            },
        });
        return { target, jobId: id };
    }

    async generateDailyJobsForScheduler(
        scheduler: SchedulerAndTargets,
    ): Promise<void> {
        const dates = getDailyDatesFromCron(scheduler.cron);
        try {
            const promises = dates.map((date: Date) =>
                this.addScheduledDeliveryJob(date, scheduler),
            );

            Logger.info(
                `Creating ${promises.length} scheduled delivery jobs for scheduler ${scheduler.schedulerUuid}`,
            );
            const jobs = await Promise.all(promises);
            jobs.map(async ({ jobId, date }) => {
                await this.schedulerModel.logSchedulerJob({
                    task: 'handleScheduledDelivery',
                    schedulerUuid: scheduler.schedulerUuid,
                    jobGroup: jobId,
                    jobId,
                    scheduledTime: date,
                    status: SchedulerJobStatus.SCHEDULED,
                });
            });
        } catch (err: any) {
            Logger.error(
                `Unable to schedule job for scheduler ${scheduler.schedulerUuid}`,
                err,
            );
            throw err;
        }
    }

    async generateJobsForSchedulerTargets(
        scheduledTime: Date,
        scheduler: SchedulerAndTargets,
        page: NotificationPayloadBase['page'],
        parentJobId: string,
    ) {
        try {
            if (scheduler.format === SchedulerFormat.GSHEETS) {
                Logger.info(
                    `Creating gsheet notification jobs for scheduler ${scheduler.schedulerUuid}`,
                );
                const job = await this.addNotificationJob(
                    scheduledTime,
                    parentJobId,
                    scheduler,
                    undefined,
                    page,
                );
                return [job];
            }
            const promises = scheduler.targets.map((target) =>
                this.addNotificationJob(
                    scheduledTime,
                    parentJobId,
                    scheduler,
                    target,
                    page,
                ),
            );
            Logger.info(
                `Creating ${promises.length} notification jobs for scheduler ${scheduler.schedulerUuid}`,
            );
            return await Promise.all(promises);
        } catch (err: any) {
            Logger.error(
                `Unable to schedule notification job for scheduler ${scheduler.schedulerUuid}`,
                err,
            );
            throw err;
        }
    }

    async downloadCsvJob(payload: DownloadCsvPayload) {
        const graphileClient = await this.graphileUtils;
        const now = new Date();
        const { id: jobId } = await graphileClient.addJob(
            'downloadCsv',
            payload,
            {
                runAt: now, // now
                maxAttempts: 1,
            },
        );
        await this.schedulerModel.logSchedulerJob({
            task: 'downloadCsv',
            jobId,
            scheduledTime: now,
            status: SchedulerJobStatus.SCHEDULED,
            details: { createdByUserUuid: payload.userUuid },
        });

        return { jobId };
    }

    async generateValidation(payload: ValidateProjectPayload) {
        const graphileClient = await this.graphileUtils;
        const now = new Date();
        const { id: jobId } = await graphileClient.addJob(
            'validateProject',
            payload,
            {
                runAt: now,
                maxAttempts: 1,
            },
        );
        await this.schedulerModel.logSchedulerJob({
            task: 'validateProject',
            jobId,
            scheduledTime: now,
            status: SchedulerJobStatus.SCHEDULED,
            details: {},
        });

        return jobId;
    }

    async compileProject(payload: CompileProjectPayload) {
        const graphileClient = await this.graphileUtils;
        const now = new Date();
        const { id: jobId } = await graphileClient.addJob(
            'compileProject',
            payload,
            {
                runAt: now, // now
                maxAttempts: 1,
            },
        );
        await this.schedulerModel.logSchedulerJob({
            task: 'compileProject',
            jobId,
            scheduledTime: now,
            status: SchedulerJobStatus.SCHEDULED,
            details: { createdByUserUuid: payload.createdByUserUuid },
        });

        return { jobId };
    }

    async testAndCompileProject(payload: CompileProjectPayload) {
        const graphileClient = await this.graphileUtils;
        const now = new Date();
        const { id: jobId } = await graphileClient.addJob(
            'testAndCompileProject',
            payload,
            {
                runAt: now, // now
                maxAttempts: 1,
            },
        );
        await this.schedulerModel.logSchedulerJob({
            task: 'testAndCompileProject',
            jobId,
            scheduledTime: now,
            status: SchedulerJobStatus.SCHEDULED,
            details: { createdByUserUuid: payload.createdByUserUuid },
        });

        return { jobId };
    }

    async getJobStatistics(): Promise<
        { error: boolean; locked: boolean; count: number }[]
    > {
        const graphileClient = await this.graphileUtils;
        const query = `
            select 
              last_error is not null as error, 
              locked_by is not null as locked, 
              count(*) as count
            from graphile_worker.jobs
            group by 1, 2
        `;
        const stats = await graphileClient.withPgClient(async (pgClient) => {
            const { rows } = await pgClient.query(query);
            return rows;
        });
        return stats;
    }
}
