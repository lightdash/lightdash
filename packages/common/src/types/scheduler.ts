import { MetricQuery } from './metricQuery';

export type SchedulerCsvOptions = {
    formatted: boolean;
    limit: 'table' | 'all' | number;
};

export type SchedulerImageOptions = {};

export type SchedulerOptions = SchedulerCsvOptions | SchedulerImageOptions;

export enum SchedulerJobStatus {
    SCHEDULED = 'scheduled',
    STARTED = 'started',
    COMPLETED = 'completed',
    ERROR = 'error',
}

export type SchedulerLog = {
    task:
        | 'handleScheduledDelivery'
        | 'sendEmailNotification'
        | 'sendSlackNotification'
        | 'downloadCsv';
    schedulerUuid?: string;
    jobId: string;
    jobGroup?: string;
    scheduledTime: Date;
    status: SchedulerJobStatus;
    target?: string;
    targetType?: 'email' | 'slack';
    details?: Record<string, any>;
};

export type SchedulerBase = {
    schedulerUuid: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    createdBy: string;
    format: 'csv' | 'image';
    cron: string;
    savedChartUuid: string | null;
    dashboardUuid: string | null;
    options: SchedulerOptions;
};

export type ChartScheduler = SchedulerBase & {
    savedChartUuid: string;
    dashboardUuid: null;
};
export type DashboardScheduler = SchedulerBase & {
    savedChartUuid: null;
    dashboardUuid: string;
};

export type Scheduler = ChartScheduler | DashboardScheduler;

export type SchedulerAndTargets = Scheduler & {
    targets: (SchedulerSlackTarget | SchedulerEmailTarget)[];
};

export type SchedulerSlackTarget = {
    schedulerSlackTargetUuid: string;
    createdAt: Date;
    updatedAt: Date;
    schedulerUuid: string;
    channel: string;
};

export type SchedulerEmailTarget = {
    schedulerEmailTargetUuid: string;
    createdAt: Date;
    updatedAt: Date;
    schedulerUuid: string;
    recipient: string;
};

export type CreateSchedulerTarget =
    | Pick<SchedulerSlackTarget, 'channel'>
    | Pick<SchedulerEmailTarget, 'recipient'>;
export type UpdateSchedulerSlackTarget = Pick<
    SchedulerSlackTarget,
    'schedulerSlackTargetUuid' | 'channel'
>;

export type UpdateSchedulerEmailTarget = Pick<
    SchedulerEmailTarget,
    'schedulerEmailTargetUuid' | 'recipient'
>;

export type CreateSchedulerAndTargets = Omit<
    Scheduler,
    'schedulerUuid' | 'createdAt' | 'updatedAt'
> & {
    targets: CreateSchedulerTarget[];
};

export type CreateSchedulerAndTargetsWithoutIds = Omit<
    CreateSchedulerAndTargets,
    'savedChartUuid' | 'dashboardUuid' | 'createdBy'
>;

export type UpdateSchedulerAndTargets = Pick<
    Scheduler,
    'schedulerUuid' | 'name' | 'cron' | 'format' | 'options'
> & {
    targets: Array<
        | CreateSchedulerTarget
        | UpdateSchedulerSlackTarget
        | UpdateSchedulerEmailTarget
    >;
};

export type UpdateSchedulerAndTargetsWithoutId = Omit<
    UpdateSchedulerAndTargets,
    'schedulerUuid'
>;

export const isUpdateSchedulerSlackTarget = (
    data: CreateSchedulerTarget | UpdateSchedulerSlackTarget,
): data is UpdateSchedulerSlackTarget =>
    'schedulerSlackTargetUuid' in data && !!data.schedulerSlackTargetUuid;

export const isUpdateSchedulerEmailTarget = (
    data: CreateSchedulerTarget | UpdateSchedulerEmailTarget,
): data is UpdateSchedulerEmailTarget =>
    'schedulerEmailTargetUuid' in data && !!data.schedulerEmailTargetUuid;

export const isChartScheduler = (data: Scheduler): data is ChartScheduler =>
    'savedChartUuid' in data && !!data.savedChartUuid;

export const isSlackTarget = (
    target: SchedulerSlackTarget | SchedulerEmailTarget,
): target is SchedulerSlackTarget => 'channel' in target;

export const isEmailTarget = (
    target: SchedulerSlackTarget | SchedulerEmailTarget,
): target is SchedulerEmailTarget => !isSlackTarget(target);

export const isCreateSchedulerSlackTarget = (
    target:
        | Pick<SchedulerSlackTarget, 'channel'>
        | Pick<SchedulerEmailTarget, 'recipient'>,
): target is Pick<SchedulerSlackTarget, 'channel'> => 'channel' in target;

export const isSchedulerCsvOptions = (
    options: SchedulerCsvOptions | SchedulerImageOptions,
): options is SchedulerCsvOptions => options && 'limit' in options;

export type ApiSchedulerAndTargetsResponse = {
    status: 'ok';
    results: SchedulerAndTargets;
};

export type SchedulerWithLogs = {
    schedulers: SchedulerBase[];
    logs: SchedulerLog[];
};

export type ScheduledJobs = {
    date: Date;
    id: string;
};
export type ApiScheduledJobsResponse = {
    status: 'ok';
    results: ScheduledJobs[];
};

export type ApiSchedulerLogsResponse = {
    status: 'ok';
    results: SchedulerWithLogs;
};

// Scheduler task types

export type ScheduledDeliveryPayload = { schedulerUuid: string };

export enum LightdashPage {
    DASHBOARD = 'dashboard',
    CHART = 'chart',
    EXPLORE = 'explore',
}

export type NotificationPayloadBase = {
    schedulerUuid: string;
    scheduledTime: Date;
    jobGroup: string;
    page: {
        url: string;
        details: {
            name: string;
            description: string | undefined;
        };
        pageType: LightdashPage;
        organizationUuid: string;
        imageUrl?: string;
        csvUrl?: {
            path: string;
            filename: string;
        };
        csvUrls?: {
            path: string;
            filename: string;
        }[];
    };
};

export type SlackNotificationPayload = NotificationPayloadBase & {
    schedulerSlackTargetUuid: string;
};

export type EmailNotificationPayload = NotificationPayloadBase & {
    schedulerEmailTargetUuid: string;
};

export type DownloadCsvPayload = {
    userUuid: string;
    projectUuid: string;
    exploreId: string;
    metricQuery: MetricQuery;
    onlyRaw: boolean;
    csvLimit: number | null | undefined;
    showTableNames: boolean;
    columnOrder: string[];
    customLabels: Record<string, string> | undefined;
};

export type ApiCsvUrlResponse = {
    status: 'ok';
    results: {
        url: string;
        status: string;
    };
};
