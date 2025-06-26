import { type SlackPromptJobPayload } from '../ee';
import { type SchedulerIndexCatalogJobPayload } from './catalog';
import { type UploadMetricGsheetPayload } from './gdrive';
import { type RenameResourcesPayload } from './rename';
import {
    type CompileProjectPayload,
    type DownloadCsvPayload,
    type EmailNotificationPayload,
    type ExportCsvDashboardPayload,
    type GsheetsNotificationPayload,
    type MsTeamsNotificationPayload,
    type ReplaceCustomFieldsPayload,
    type ScheduledDeliveryPayload,
    type SchedulerCreateProjectWithCompilePayload,
    type SlackNotificationPayload,
    type TraceTaskBase,
    type ValidateProjectPayload,
} from './scheduler';
import {
    type SqlRunnerPayload,
    type SqlRunnerPivotQueryPayload,
} from './sqlRunner';

export const EE_SCHEDULER_TASKS = {
    SLACK_AI_PROMPT: 'slackAiPrompt',
} as const;

export const SCHEDULER_TASKS = {
    HANDLE_SCHEDULED_DELIVERY: 'handleScheduledDelivery',
    SEND_SLACK_NOTIFICATION: 'sendSlackNotification',
    SEND_EMAIL_NOTIFICATION: 'sendEmailNotification',
    SEND_MSTEAMS_NOTIFICATION: 'sendMsTeamsNotification',
    UPLOAD_GSHEETS: 'uploadGsheets',
    DOWNLOAD_CSV: 'downloadCsv',
    UPLOAD_GSHEET_FROM_QUERY: 'uploadGsheetFromQuery',
    VALIDATE_PROJECT: 'validateProject',
    COMPILE_PROJECT: 'compileProject',
    CREATE_PROJECT_WITH_COMPILE: 'createProjectWithCompile',
    TEST_AND_COMPILE_PROJECT: 'testAndCompileProject',
    SQL_RUNNER: 'sqlRunner',
    SQL_RUNNER_PIVOT_QUERY: 'sqlRunnerPivotQuery',
    REPLACE_CUSTOM_FIELDS: 'replaceCustomFields',
    INDEX_CATALOG: 'indexCatalog',
    GENERATE_DAILY_JOBS: 'generateDailyJobs',
    EXPORT_CSV_DASHBOARD: 'exportCsvDashboard',
    RENAME_RESOURCES: 'renameResources',
    ...EE_SCHEDULER_TASKS,
} as const;

// Map each task to its payload type
export interface TaskPayloadMap {
    [SCHEDULER_TASKS.HANDLE_SCHEDULED_DELIVERY]: ScheduledDeliveryPayload;
    [SCHEDULER_TASKS.SEND_SLACK_NOTIFICATION]: SlackNotificationPayload;
    [SCHEDULER_TASKS.SEND_EMAIL_NOTIFICATION]: EmailNotificationPayload;
    [SCHEDULER_TASKS.SEND_MSTEAMS_NOTIFICATION]: MsTeamsNotificationPayload;
    [SCHEDULER_TASKS.UPLOAD_GSHEETS]: GsheetsNotificationPayload;
    [SCHEDULER_TASKS.DOWNLOAD_CSV]: DownloadCsvPayload;
    [SCHEDULER_TASKS.UPLOAD_GSHEET_FROM_QUERY]: UploadMetricGsheetPayload;
    [SCHEDULER_TASKS.VALIDATE_PROJECT]: ValidateProjectPayload;
    [SCHEDULER_TASKS.COMPILE_PROJECT]: CompileProjectPayload;
    [SCHEDULER_TASKS.CREATE_PROJECT_WITH_COMPILE]: SchedulerCreateProjectWithCompilePayload;
    [SCHEDULER_TASKS.TEST_AND_COMPILE_PROJECT]: CompileProjectPayload;
    [SCHEDULER_TASKS.SQL_RUNNER]: SqlRunnerPayload;
    [SCHEDULER_TASKS.SQL_RUNNER_PIVOT_QUERY]: SqlRunnerPivotQueryPayload;
    [SCHEDULER_TASKS.REPLACE_CUSTOM_FIELDS]: ReplaceCustomFieldsPayload;
    [SCHEDULER_TASKS.INDEX_CATALOG]: SchedulerIndexCatalogJobPayload;
    [SCHEDULER_TASKS.GENERATE_DAILY_JOBS]: TraceTaskBase;
    [SCHEDULER_TASKS.EXPORT_CSV_DASHBOARD]: ExportCsvDashboardPayload;
    [SCHEDULER_TASKS.SLACK_AI_PROMPT]: SlackPromptJobPayload;
    [SCHEDULER_TASKS.RENAME_RESOURCES]: RenameResourcesPayload;
}

export interface EETaskPayloadMap {
    [EE_SCHEDULER_TASKS.SLACK_AI_PROMPT]: SlackPromptJobPayload;
}

export type SchedulerTaskName =
    typeof SCHEDULER_TASKS[keyof typeof SCHEDULER_TASKS];
