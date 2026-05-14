import assertUnreachable from '../utils/assertUnreachable';
import { type AnyType } from './any';
import { type ApiSuccess } from './api/success';
import type { DownloadFileType } from './downloadFile';
import { type Explore, type ExploreError } from './explore';
import { type DashboardFilterRule, type DashboardFilters } from './filter';
import { type KnexPaginatedData } from './knex-paginate';
import { type ParametersValuesMap } from './parameters';
import { type PivotConfig } from './pivot';
import { SchedulerResourceType } from './schedulerLog';
import type { PartialFailure, SchedulerRun } from './schedulerLog';
import { type DateGranularity } from './timeFrames';
import { type ValidationTarget } from './validation';

export type SchedulerCsvOptions = {
    formatted: boolean;
    limit: 'table' | 'all' | number;
    asAttachment?: boolean;
    exportPivotedData?: boolean;
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
export type SchedulerPdfOptions = Record<string, never>;
export type SchedulerOptions =
    | SchedulerCsvOptions
    | SchedulerImageOptions
    | SchedulerGsheetsOptions
    | SchedulerPdfOptions;

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
    PDF = 'pdf',
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
    createdByName: string | null;
    format: SchedulerFormat;
    cron: string;
    timezone?: string;
    projectSchedulerTimezone?: string;
    savedChartUuid: string | null;
    savedChartName: string | null;
    dashboardUuid: string | null;
    dashboardName: string | null;
    savedSqlUuid: string | null;
    savedSqlName: string | null;
    options: SchedulerOptions;
    thresholds?: ThresholdOptions[]; // it can ben an array of AND conditions
    enabled: boolean;
    notificationFrequency?: NotificationFrequency;
    includeLinks: boolean;
    projectUuid?: string | null;
    projectName?: string | null;
};

export type ChartScheduler = SchedulerBase & {
    savedChartUuid: string;
    dashboardUuid: null;
    savedSqlUuid: null;
};

export const isDashboardScheduler = (
    scheduler: Scheduler | CreateSchedulerAndTargets,
): scheduler is DashboardScheduler =>
    'dashboardUuid' in scheduler && !!scheduler.dashboardUuid;

export type DashboardScheduler = SchedulerBase & {
    savedChartUuid: null;
    dashboardUuid: string;
    savedSqlUuid: null;
    filters?: DashboardFilterRule[];
    parameters?: ParametersValuesMap;
    customViewportWidth?: number;
    selectedTabs: string[] | null;
};

export type SqlChartScheduler = SchedulerBase & {
    savedChartUuid: null;
    dashboardUuid: null;
    savedSqlUuid: string;
};

export const isSqlChartScheduler = (
    scheduler: Scheduler | CreateSchedulerAndTargets,
): scheduler is SqlChartScheduler =>
    'savedSqlUuid' in scheduler && !!scheduler.savedSqlUuid;

export type Scheduler = ChartScheduler | DashboardScheduler | SqlChartScheduler;

export type SchedulerAndTargets = Scheduler & {
    targets: (
        | SchedulerSlackTarget
        | SchedulerEmailTarget
        | SchedulerMsTeamsTarget
        | SchedulerGoogleChatTarget
    )[];
    latestRun?: SchedulerRun | null;
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
export type SchedulerGoogleChatTarget = {
    schedulerGoogleChatTargetUuid: string;
    createdAt: Date;
    updatedAt: Date;
    schedulerUuid: string;
    googleChatWebhook: string;
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
    | Pick<SchedulerGoogleChatTarget, 'googleChatWebhook'>
    | Pick<SchedulerEmailTarget, 'recipient'>;

export const getSchedulerTargetUuid = (
    target:
        | SchedulerSlackTarget
        | SchedulerMsTeamsTarget
        | SchedulerGoogleChatTarget
        | SchedulerEmailTarget
        | CreateSchedulerTarget,
): string | undefined => {
    if ('schedulerSlackTargetUuid' in target) {
        return target.schedulerSlackTargetUuid;
    }
    if ('schedulerMsTeamsTargetUuid' in target) {
        return target.schedulerMsTeamsTargetUuid;
    }
    if ('schedulerGoogleChatTargetUuid' in target) {
        return target.schedulerGoogleChatTargetUuid;
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

export type UpdateSchedulerGoogleChatTarget = Pick<
    SchedulerGoogleChatTarget,
    'schedulerGoogleChatTargetUuid' | 'googleChatWebhook'
>;

export type UpdateSchedulerEmailTarget = Pick<
    SchedulerEmailTarget,
    'schedulerEmailTargetUuid' | 'recipient'
>;

export type CreateSchedulerAndTargets = Omit<
    Scheduler,
    | 'schedulerUuid'
    | 'createdAt'
    | 'updatedAt'
    | 'createdByName'
    | 'savedChartName'
    | 'dashboardName'
    | 'savedSqlName'
> & {
    targets: CreateSchedulerTarget[];
};

export type CreateSchedulerAndTargetsWithoutIds = Omit<
    CreateSchedulerAndTargets,
    'savedChartUuid' | 'dashboardUuid' | 'savedSqlUuid' | 'createdBy'
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
    Pick<
        DashboardScheduler,
        'filters' | 'parameters' | 'customViewportWidth'
    > & {
        targets: Array<
            | CreateSchedulerTarget
            | UpdateSchedulerSlackTarget
            | UpdateSchedulerEmailTarget
            | UpdateSchedulerMsTeamsTarget
            | UpdateSchedulerGoogleChatTarget
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

export const isUpdateSchedulerGoogleChatTarget = (
    data:
        | CreateSchedulerTarget
        | UpdateSchedulerSlackTarget
        | UpdateSchedulerGoogleChatTarget,
): data is UpdateSchedulerGoogleChatTarget =>
    'schedulerGoogleChatTargetUuid' in data &&
    !!data.schedulerGoogleChatTargetUuid;

export const isUpdateSchedulerEmailTarget = (
    data: CreateSchedulerTarget | UpdateSchedulerEmailTarget,
): data is UpdateSchedulerEmailTarget =>
    'schedulerEmailTargetUuid' in data && !!data.schedulerEmailTargetUuid;

export const isChartScheduler = (
    data: Scheduler | CreateSchedulerAndTargets,
): data is ChartScheduler => 'savedChartUuid' in data && !!data.savedChartUuid;

export const getSchedulerResourceTypeAndId = (
    scheduler: Scheduler | CreateSchedulerAndTargets,
): { resourceType: SchedulerResourceType; resourceId: string } => {
    if (isChartScheduler(scheduler)) {
        return {
            resourceType: SchedulerResourceType.CHART,
            resourceId: scheduler.savedChartUuid,
        };
    }
    if (isSqlChartScheduler(scheduler)) {
        return {
            resourceType: SchedulerResourceType.SQL_CHART,
            resourceId: scheduler.savedSqlUuid,
        };
    }
    if (isDashboardScheduler(scheduler)) {
        return {
            resourceType: SchedulerResourceType.DASHBOARD,
            resourceId: scheduler.dashboardUuid,
        };
    }
    throw new Error('Unknown scheduler resource type');
};

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
        | SchedulerMsTeamsTarget
        | SchedulerGoogleChatTarget,
): target is SchedulerSlackTarget => 'channel' in target;

export const isMsTeamsTarget = (
    target:
        | SchedulerSlackTarget
        | SchedulerEmailTarget
        | SchedulerMsTeamsTarget
        | SchedulerGoogleChatTarget,
): target is SchedulerMsTeamsTarget => 'webhook' in target;

export const isGoogleChatTarget = (
    target:
        | SchedulerSlackTarget
        | SchedulerEmailTarget
        | SchedulerMsTeamsTarget
        | SchedulerGoogleChatTarget,
): target is SchedulerGoogleChatTarget => 'googleChatWebhook' in target;

export const isEmailTarget = (
    target:
        | SchedulerSlackTarget
        | SchedulerEmailTarget
        | SchedulerMsTeamsTarget
        | SchedulerGoogleChatTarget,
): target is SchedulerEmailTarget => 'recipient' in target;

export const isCreateSchedulerSlackTarget = (
    target:
        | Pick<SchedulerSlackTarget, 'channel'>
        | Pick<SchedulerEmailTarget, 'recipient'>
        | Pick<SchedulerMsTeamsTarget, 'webhook'>
        | Pick<SchedulerGoogleChatTarget, 'googleChatWebhook'>,
): target is Pick<SchedulerSlackTarget, 'channel'> => 'channel' in target;

export const isCreateSchedulerMsTeamsTarget = (
    target:
        | Pick<SchedulerSlackTarget, 'channel'>
        | Pick<SchedulerEmailTarget, 'recipient'>
        | Pick<SchedulerMsTeamsTarget, 'webhook'>
        | Pick<SchedulerGoogleChatTarget, 'googleChatWebhook'>,
): target is Pick<SchedulerMsTeamsTarget, 'webhook'> => 'webhook' in target;

export const isCreateSchedulerGoogleChatTarget = (
    target:
        | Pick<SchedulerSlackTarget, 'channel'>
        | Pick<SchedulerEmailTarget, 'recipient'>
        | Pick<SchedulerMsTeamsTarget, 'webhook'>
        | Pick<SchedulerGoogleChatTarget, 'googleChatWebhook'>,
): target is Pick<SchedulerGoogleChatTarget, 'googleChatWebhook'> =>
    'googleChatWebhook' in target;

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

export type ApiSchedulersResponse = ApiSuccess<
    KnexPaginatedData<SchedulerAndTargets[]>
>;

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

export type ReassignSchedulerOwnerRequest = {
    schedulerUuids: string[];
    newOwnerUserUuid: string;
};

export type ApiReassignSchedulerOwnerResponse = ApiSuccess<
    SchedulerAndTargets[]
>;

export type UserSchedulersSummary = {
    totalCount: number;
    hasGsheetsSchedulers: boolean;
    byProject: Array<{
        projectUuid: string;
        projectName: string;
        count: number;
    }>;
};

export type ReassignUserSchedulersRequest = {
    newOwnerUserUuid: string;
};

export type ApiUserSchedulersSummaryResponse =
    ApiSuccess<UserSchedulersSummary>;

export type ApiReassignUserSchedulersResponse = ApiSuccess<{
    reassignedCount: number;
}>;

export type TraceTaskBase = {
    organizationUuid: string;
    projectUuid: string;
    userUuid: string;
    schedulerUuid?: string;
};

export type ManagedAgentHeartbeatTriggeredBy = 'cron' | 'manual' | 'on_enable';

export type ManagedAgentHeartbeatPayload = TraceTaskBase & {
    triggeredBy?: ManagedAgentHeartbeatTriggeredBy;
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
    SQL_CHART = 'sql_chart',
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
        imageS3Key?: string;
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
        failures?: PartialFailure[];
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

// Batch notification payloads - one job per delivery type instead of per recipient
export type SlackBatchNotificationPayload = TraceTaskBase &
    Omit<NotificationPayloadBase, 'scheduler'> & {
        targets: SchedulerSlackTarget[];
        scheduler: SchedulerAndTargets;
    };

export type EmailBatchNotificationPayload = TraceTaskBase &
    Omit<NotificationPayloadBase, 'scheduler'> & {
        targets: SchedulerEmailTarget[];
        scheduler: SchedulerAndTargets;
    };

export type MsTeamsBatchNotificationPayload = TraceTaskBase &
    Omit<NotificationPayloadBase, 'scheduler'> & {
        targets: SchedulerMsTeamsTarget[];
        scheduler: SchedulerAndTargets;
    };

export type GoogleChatNotificationPayload = TraceTaskBase &
    NotificationPayloadBase & {
        schedulerGoogleChatTargetUuid?: string;
        googleChatWebhook: string;
    };

export type GoogleChatBatchNotificationPayload = TraceTaskBase &
    Omit<NotificationPayloadBase, 'scheduler'> & {
        targets: SchedulerGoogleChatTarget[];
        scheduler: SchedulerAndTargets;
    };

// Result tracking for batch deliveries
export type DeliveryResult = {
    target: string; // channel ID, email, or webhook URL
    targetUuid?: string;
    success: boolean;
    error?: string;
};

export type BatchDeliveryResult = {
    type: 'slack' | 'email' | 'msteams' | 'googlechat';
    total: number;
    succeeded: number;
    failed: number;
    results: DeliveryResult[];
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

export type PreAggregateMaterializationTrigger =
    | 'compile'
    | 'cron'
    | 'manual'
    | 'webhook';

export type MaterializePreAggregatePayload = TraceTaskBase & {
    preAggregateDefinitionUuid: string;
    trigger: PreAggregateMaterializationTrigger;
};

export type ReplaceCustomFieldsPayload = TraceTaskBase;

export type ValidateProjectPayload = TraceTaskBase & {
    context: 'lightdash_app' | 'dbt_refresh' | 'test_and_compile' | 'cli';
    explores?: (Explore | ExploreError)[];
    validationTargets?: ValidationTarget[];
    onlyValidateExploresInArgs?: boolean;
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
    selectedTabs: string[] | null;
    dateZoomGranularity?: DateGranularity | string;
};

export type DownloadAsyncQueryResultsPayload = TraceTaskBase & {
    queryUuid: string;
    type?: DownloadFileType;
    onlyRaw?: boolean;
    showTableNames?: boolean;
    customLabels?: Record<string, string>;
    columnOrder?: string[];
    hiddenFields?: string[];
    pivotConfig?: PivotConfig;
    exportPivotedData?: boolean;
    attachmentDownloadName?: string;
    encodedJwt?: string;
};

export type SyncSlackChannelsPayload = Pick<
    TraceTaskBase,
    'organizationUuid' | 'schedulerUuid'
> & {
    projectUuid: undefined;
    userUuid: undefined;
};
