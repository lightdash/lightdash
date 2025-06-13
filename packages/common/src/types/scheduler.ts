import assertUnreachable from '../utils/assertUnreachable';
import { type AnyType } from './any';
import { type Explore, type ExploreError } from './explore';
import { type DashboardFilterRule, type DashboardFilters } from './filter';
import { type MetricQuery } from './metricQuery';
import { type PivotConfig } from './pivot';
import { type DateGranularity } from './timeFrames';
import { type ValidationTarget } from './validation';

export type SchedulerCsvOptions = {
    formatted: boolean;
    limit: 'table' | 'all' | number;
};

export type SchedulerImageOptions = {
    withPdf?: boolean;
};

export type SchedulerGsheetsOptions = {
    gdriveId: string;
    gdriveName: string;
    gdriveOrganizationName: string;
    url: string;
    tabName?: string;
};
export type SchedulerOptions =
    | SchedulerCsvOptions
    | SchedulerImageOptions
    | SchedulerGsheetsOptions;

export enum SchedulerJobStatus {
    SCHEDULED = 'scheduled',
    STARTED = 'started',
    COMPLETED = 'completed',
    ERROR = 'error',
}

export enum SchedulerFormat {
    CSV = 'csv',
    XLSX = 'xlsx',
    IMAGE = 'image',
    GSHEETS = 'gsheets',
}

export enum JobPriority {
    HIGH = 0, // UI-waiting jobs (queries, download csv, compile)
    MEDIUM = 1, // Related jobs (validate/catalogindex)
    LOW = 2, // Background jobs (scheduled deliveries, sheets sync)
}

export enum ThresholdOperator {
    GREATER_THAN = 'greaterThan',
    LESS_THAN = 'lessThan',
    INCREASED_BY = 'increasedBy',
    DECREASED_BY = 'decreasedBy',
    // HAS_CHANGED = '=',
}

export enum NotificationFrequency {
    ALWAYS = 'always',
    ONCE = 'once',
    // DAILY = 'daily',
}
export const operatorActionValue = (
    operator: ThresholdOperator,
    value: number | string,
    highlight: string = '*',
) => {
    switch (operator) {
        case ThresholdOperator.GREATER_THAN:
            return `exceeded ${highlight}${value}${highlight}`;
        case ThresholdOperator.LESS_THAN:
            return `fell below ${highlight}${value}${highlight}`;
        case ThresholdOperator.INCREASED_BY:
            return `increased by ${highlight}${value}%${highlight} or more`;
        case ThresholdOperator.DECREASED_BY:
            return `decreased by ${highlight}${value}%${highlight} or less`;
        default:
            assertUnreachable(
                operator,
                `Unknown threshold operator: ${operator}`,
            );
    }
    return '';
};

export type ThresholdOptions = {
    operator: ThresholdOperator;
    fieldId: string;
    value: number;
};

export type SchedulerBase = {
    schedulerUuid: string;
    name: string;
    message?: string;
    createdAt: Date;
    updatedAt: Date;
    createdBy: string;
    format: SchedulerFormat;
    cron: string;
    timezone?: string;
    savedChartUuid: string | null;
    dashboardUuid: string | null;
    options: SchedulerOptions;
    thresholds?: ThresholdOptions[]; // it can ben an array of AND conditions
    enabled: boolean;
    notificationFrequency?: NotificationFrequency;
    includeLinks: boolean;
};

export type ChartScheduler = SchedulerBase & {
    savedChartUuid: string;
    dashboardUuid: null;
};

export const isDashboardScheduler = (
    scheduler: Scheduler | CreateSchedulerAndTargets,
): scheduler is DashboardScheduler => scheduler.dashboardUuid !== undefined;

export type SchedulerFilterRule = DashboardFilterRule & {
    tileTargets: undefined;
};

export type DashboardScheduler = SchedulerBase & {
    savedChartUuid: null;
    dashboardUuid: string;
    filters?: SchedulerFilterRule[];
    customViewportWidth?: number;
    selectedTabs?: string[];
};

export type Scheduler = ChartScheduler | DashboardScheduler;

export type SchedulerAndTargets = Scheduler & {
    targets: (
        | SchedulerSlackTarget
        | SchedulerEmailTarget
        | SchedulerMsTeamsTarget
    )[];
};

export type SchedulerSlackTarget = {
    schedulerSlackTargetUuid: string;
    createdAt: Date;
    updatedAt: Date;
    schedulerUuid: string;
    channel: string;
};
export type SchedulerMsTeamsTarget = {
    schedulerMsTeamsTargetUuid: string;
    createdAt: Date;
    updatedAt: Date;
    schedulerUuid: string;
    webhook: string;
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
    | Pick<SchedulerMsTeamsTarget, 'webhook'>
    | Pick<SchedulerEmailTarget, 'recipient'>;

export const getSchedulerTargetUuid = (
    target:
        | SchedulerSlackTarget
        | SchedulerMsTeamsTarget
        | SchedulerEmailTarget
        | CreateSchedulerTarget,
): string | undefined => {
    if ('schedulerSlackTargetUuid' in target) {
        return target.schedulerSlackTargetUuid;
    }
    if ('schedulerMsTeamsTargetUuid' in target) {
        return target.schedulerMsTeamsTargetUuid;
    }
    if ('schedulerEmailTargetUuid' in target) {
        return target.schedulerEmailTargetUuid;
    }
    return undefined;
};

export type UpdateSchedulerSlackTarget = Pick<
    SchedulerSlackTarget,
    'schedulerSlackTargetUuid' | 'channel'
>;

export type UpdateSchedulerMsTeamsTarget = Pick<
    SchedulerMsTeamsTarget,
    'schedulerMsTeamsTargetUuid' | 'webhook'
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
    | 'schedulerUuid'
    | 'name'
    | 'message'
    | 'cron'
    | 'timezone'
    | 'format'
    | 'options'
    | 'thresholds'
    | 'notificationFrequency'
    | 'includeLinks'
> &
    Pick<DashboardScheduler, 'filters' | 'customViewportWidth'> & {
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

export const isUpdateSchedulerMsTeamsTarget = (
    data: CreateSchedulerTarget | UpdateSchedulerSlackTarget,
): data is UpdateSchedulerMsTeamsTarget =>
    'schedulerMsTeamsTargetUuid' in data && !!data.schedulerMsTeamsTargetUuid;

export const isUpdateSchedulerEmailTarget = (
    data: CreateSchedulerTarget | UpdateSchedulerEmailTarget,
): data is UpdateSchedulerEmailTarget =>
    'schedulerEmailTargetUuid' in data && !!data.schedulerEmailTargetUuid;

export const isChartScheduler = (
    data: Scheduler | CreateSchedulerAndTargets,
): data is ChartScheduler => 'savedChartUuid' in data && !!data.savedChartUuid;

export const isChartCreateScheduler = (
    data: CreateSchedulerAndTargets,
): data is ChartScheduler & { targets: CreateSchedulerTarget[] } =>
    'savedChartUuid' in data && !!data.savedChartUuid;

export const isDashboardCreateScheduler = (
    data: CreateSchedulerAndTargets,
): data is DashboardScheduler & { targets: CreateSchedulerTarget[] } =>
    'dashboardUuid' in data && !!data.dashboardUuid;

export const isSlackTarget = (
    target:
        | SchedulerSlackTarget
        | SchedulerEmailTarget
        | SchedulerMsTeamsTarget,
): target is SchedulerSlackTarget => 'channel' in target;

export const isMsTeamsTarget = (
    target:
        | SchedulerSlackTarget
        | SchedulerEmailTarget
        | SchedulerMsTeamsTarget,
): target is SchedulerMsTeamsTarget => 'webhook' in target;

export const isEmailTarget = (
    target:
        | SchedulerSlackTarget
        | SchedulerEmailTarget
        | SchedulerMsTeamsTarget,
): target is SchedulerEmailTarget => 'recipient' in target;

export const isCreateSchedulerSlackTarget = (
    target:
        | Pick<SchedulerSlackTarget, 'channel'>
        | Pick<SchedulerEmailTarget, 'recipient'>
        | Pick<SchedulerMsTeamsTarget, 'webhook'>,
): target is Pick<SchedulerSlackTarget, 'channel'> => 'channel' in target;

export const isCreateSchedulerMsTeamsTarget = (
    target:
        | Pick<SchedulerSlackTarget, 'channel'>
        | Pick<SchedulerEmailTarget, 'recipient'>
        | Pick<SchedulerMsTeamsTarget, 'webhook'>,
): target is Pick<SchedulerMsTeamsTarget, 'webhook'> => 'webhook' in target;

export const isSchedulerCsvOptions = (
    options:
        | SchedulerCsvOptions
        | SchedulerImageOptions
        | SchedulerGsheetsOptions,
): options is SchedulerCsvOptions => options && 'limit' in options;

export const isSchedulerImageOptions = (
    options:
        | SchedulerCsvOptions
        | SchedulerImageOptions
        | SchedulerGsheetsOptions,
): options is SchedulerImageOptions => options && 'withPdf' in options;

export const isSchedulerGsheetsOptions = (
    options:
        | SchedulerCsvOptions
        | SchedulerImageOptions
        | SchedulerGsheetsOptions,
): options is SchedulerGsheetsOptions => options && 'gdriveId' in options;

export type ApiSchedulerAndTargetsResponse = {
    status: 'ok';
    results: SchedulerAndTargets;
};

export type ScheduledJobs = {
    date: Date;
    id: string;
};
export type ApiScheduledJobsResponse = {
    status: 'ok';
    results: ScheduledJobs[];
};

export type ApiTestSchedulerResponse = {
    status: 'ok';
    results: {
        jobId: string;
    };
};

export type TraceTaskBase = {
    organizationUuid: string;
    projectUuid: string;
    userUuid: string;
    schedulerUuid?: string;
};

export type QueueTraceProperties = {
    traceHeader?: string;
    baggageHeader?: string;
    sentryMessageId?: string;
};

// Scheduler task types
export type ScheduledDeliveryPayload = TraceTaskBase &
    (CreateSchedulerAndTargets | Pick<Scheduler, 'schedulerUuid'>);

export const isCreateScheduler = (
    data: ScheduledDeliveryPayload,
): data is CreateSchedulerAndTargets & TraceTaskBase => 'targets' in data;
export const hasSchedulerUuid = (
    data: SchedulerAndTargets | CreateSchedulerAndTargets,
): data is SchedulerAndTargets => 'schedulerUuid' in data;

export const getSchedulerUuid = (
    data: CreateSchedulerAndTargets | Pick<Scheduler, 'schedulerUuid'>,
): string | undefined =>
    'schedulerUuid' in data ? data.schedulerUuid : undefined;

export enum LightdashPage {
    DASHBOARD = 'dashboard',
    CHART = 'chart',
    EXPLORE = 'explore',
}

export type NotificationPayloadBase = {
    schedulerUuid?: string;
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
            localPath: string;
            truncated: boolean;
        };
        csvUrls?: {
            path: string;
            filename: string;
            localPath: string;
            truncated: boolean;
        }[];
        pdfFile?: {
            source: string;
            fileName: string;
        };
    };
    scheduler: CreateSchedulerAndTargets;
};

export type SlackNotificationPayload = TraceTaskBase &
    NotificationPayloadBase & {
        schedulerSlackTargetUuid?: string;
        channel: string;
    };
export type MsTeamsNotificationPayload = TraceTaskBase &
    NotificationPayloadBase & {
        schedulerMsTeamsTargetUuid?: string;
        webhook: string;
    };

export type EmailNotificationPayload = TraceTaskBase &
    NotificationPayloadBase & {
        schedulerEmailTargetUuid?: string;
        recipient: string;
    };

export type GsheetsNotificationPayload = TraceTaskBase & {
    schedulerUuid: string;
    scheduledTime: Date;
    jobGroup: string;
};

export type DownloadCsvPayload = TraceTaskBase & {
    exploreId: string;
    metricQuery: MetricQuery;
    onlyRaw: boolean;
    csvLimit: number | null | undefined;
    showTableNames: boolean;
    columnOrder: string[];
    customLabels: Record<string, string> | undefined;
    hiddenFields: string[] | undefined;
    chartName: string | undefined;
    fromSavedChart: boolean;
    pivotConfig?: PivotConfig;
};

export type ApiCsvUrlResponse = {
    status: 'ok';
    results: {
        url: string;
        status: string;
        truncated: boolean;
    };
};

export type SchedulerCreateProjectWithCompilePayload = Omit<
    TraceTaskBase,
    'projectUuid'
> & {
    createdByUserUuid: string;
    requestMethod: string;
    isPreview: boolean;
    data: string; // base64 string (CreateProject)
    jobUuid: string;
    projectUuid: undefined; // New project uuid is not known at this point
};

export type CompileProjectPayload = TraceTaskBase & {
    createdByUserUuid: string;
    requestMethod: string;
    jobUuid: string;
    isPreview: boolean;
};

export type ReplaceCustomFieldsPayload = TraceTaskBase;

export type ValidateProjectPayload = TraceTaskBase & {
    context: 'lightdash_app' | 'dbt_refresh' | 'test_and_compile' | 'cli';
    explores?: (Explore | ExploreError)[];
    validationTargets?: ValidationTarget[];
};

export type ApiJobScheduledResponse = {
    status: 'ok';
    results: {
        jobId: string;
    };
};

export type ApiJobStatusResponse = {
    status: 'ok';
    results: {
        status: SchedulerJobStatus;
        details: Record<string, AnyType> | null;
    };
};

export type SchedulerCronUpdate = { schedulerUuid: string; cron: string };

export type ExportCsvDashboardPayload = TraceTaskBase & {
    dashboardUuid: string;
    dashboardFilters: DashboardFilters;
    dateZoomGranularity?: DateGranularity;
};
