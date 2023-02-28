import { ScheduledDeliveryPayload } from '@lightdash/common';
import { getSchedule, stringToArray } from 'cron-converter';
import {
    JobHelpers,
    parseCronItems,
    run as runGraphileWorker,
} from 'graphile-worker';
import moment from 'moment';
import { analytics } from '../analytics/client';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import { schedulerClient } from '../clients/clients';
import { LightdashConfig } from '../config/parseConfig';
import Logger from '../logger';
import { schedulerService } from '../services/services';
import {
    getNotificationPageData,
    sendEmailNotification,
    sendSlackNotification,
} from './SchedulerTask';

type SchedulerWorkerDependencies = {
    lightdashConfig: LightdashConfig;
};

export const getDailyDatesFromCron = (
    cron: string,
    when = new Date(),
): Date[] => {
    const arr = stringToArray(cron);
    const startOfMinute = moment(when).startOf('minute').toDate(); // round down to the nearest minute so we can even process 00:00 on daily jobs
    const schedule = getSchedule(arr, startOfMinute, 'UTC');
    const tomorrow = moment(startOfMinute)
        .add(1, 'day')
        .startOf('day')
        .toDate();
    const dailyDates: Date[] = [];
    while (schedule.next() < tomorrow) {
        dailyDates.push(schedule.date.toJSDate());
    }
    return dailyDates;
};

export class SchedulerWorker {
    lightdashConfig: LightdashConfig;

    constructor({ lightdashConfig }: SchedulerWorkerDependencies) {
        this.lightdashConfig = lightdashConfig;
    }

    async run() {
        // Run a worker to execute jobs:
        Logger.info('Running scheduler');
        const runner = await runGraphileWorker({
            concurrency: this.lightdashConfig.scheduler?.concurrency,
            noHandleSignals: false,
            pollInterval: 1000,
            parsedCronItems: parseCronItems([
                {
                    task: 'generateDailyJobs',
                    pattern: '0 0 * * *',
                    options: {
                        backfillPeriod: 12 * 3600 * 1000, // 12 hours in ms
                        maxAttempts: 1,
                    },
                },
            ]),
            taskList: {
                generateDailyJobs: async (
                    payload: any,
                    helpers: JobHelpers,
                ) => {
                    Logger.info(`Processing new job generateDailyJobs`);
                    const schedulers =
                        await schedulerService.getAllSchedulers();
                    const promises = schedulers.map((scheduler) =>
                        schedulerClient.generateDailyJobsForScheduler(
                            scheduler,
                        ),
                    );
                    await Promise.all(promises);
                },
                handleScheduledDelivery: async (
                    payload: any,
                    helpers: JobHelpers,
                ) => {
                    Logger.info(
                        `Processing new job handleScheduledDelivery`,
                        payload,
                    );
                    const { schedulerUuid } =
                        payload as ScheduledDeliveryPayload;
                    try {
                        analytics.track({
                            event: 'scheduler_job.started',
                            anonymousId: LightdashAnalytics.anonymousId,
                            properties: {
                                jobId: helpers.job.id,
                                schedulerId: schedulerUuid,
                            },
                        });
                        const scheduler =
                            await schedulerService.schedulerModel.getSchedulerAndTargets(
                                schedulerUuid,
                            );
                        const page = await getNotificationPageData(scheduler);
                        await schedulerClient.generateJobsForSchedulerTargets(
                            scheduler,
                            page,
                        );
                        analytics.track({
                            event: 'scheduler_job.completed',
                            anonymousId: LightdashAnalytics.anonymousId,
                            properties: {
                                jobId: helpers.job.id,
                                schedulerId: schedulerUuid,
                            },
                        });
                    } catch (e) {
                        analytics.track({
                            event: 'scheduler_job.failed',
                            anonymousId: LightdashAnalytics.anonymousId,
                            properties: {
                                jobId: helpers.job.id,
                                schedulerId: schedulerUuid,
                            },
                        });
                    }
                },
                sendSlackNotification: async (
                    payload: any,
                    helpers: JobHelpers,
                ) => {
                    Logger.info(
                        `Processing new job sendSlackNotification`,
                        payload,
                    );
                    await sendSlackNotification(helpers.job.id, payload);
                },
                sendEmailNotification: async (
                    payload: any,
                    helpers: JobHelpers,
                ) => {
                    Logger.info(
                        `Processing new job sendEmailNotification`,
                        payload,
                    );
                    await sendEmailNotification(helpers.job.id, payload);
                },
            },
        });

        await runner.promise;
    }
}
