import { type SchedulerIndexCatalogJobPayload } from './catalog';
import { type UploadMetricGsheetPayload } from './gdrive';
import {
    type CompileProjectPayload,
    type DownloadCsvPayload,
    type EmailNotificationPayload,
    type ExportCsvDashboardPayload,
    type GsheetsNotificationPayload,
    type ReplaceCustomFieldsPayload,
    type ScheduledDeliveryPayload,
    type SchedulerCreateProjectWithCompilePayload,
    type SlackNotificationPayload,
    type TraceTaskBase,
    type ValidateProjectPayload,
} from './scheduler';
import { type SemanticLayerQueryPayload } from './semanticLayer';
import {
    type SqlRunnerPayload,
    type SqlRunnerPivotQueryPayload,
} from './sqlRunner';

export const SCHEDULER_TASKS = {
    HANDLE_SCHEDULED_DELIVERY: 'handleScheduledDelivery',
    SEND_SLACK_NOTIFICATION: 'sendSlackNotification',
    SEND_EMAIL_NOTIFICATION: 'sendEmailNotification',
    UPLOAD_GSHEETS: 'uploadGsheets',
    DOWNLOAD_CSV: 'downloadCsv',
    UPLOAD_GSHEET_FROM_QUERY: 'uploadGsheetFromQuery',
    VALIDATE_PROJECT: 'validateProject',
    COMPILE_PROJECT: 'compileProject',
    CREATE_PROJECT_WITH_COMPILE: 'createProjectWithCompile',
    TEST_AND_COMPILE_PROJECT: 'testAndCompileProject',
    SEMANTIC_LAYER_QUERY: 'semanticLayer',
    SQL_RUNNER: 'sqlRunner',
    SQL_RUNNER_PIVOT_QUERY: 'sqlRunnerPivotQuery',
    REPLACE_CUSTOM_FIELDS: 'replaceCustomFields',
    INDEX_CATALOG: 'indexCatalog',
    GENERATE_DAILY_JOBS: 'generateDailyJobs',
    EXPORT_CSV_DASHBOARD: 'exportCsvDashboard',
} as const;

export type SchedulerTaskName =
    typeof SCHEDULER_TASKS[keyof typeof SCHEDULER_TASKS];

// Map each task to its payload type
export interface TaskPayloadMap {
    [SCHEDULER_TASKS.HANDLE_SCHEDULED_DELIVERY]: ScheduledDeliveryPayload;
    [SCHEDULER_TASKS.SEND_SLACK_NOTIFICATION]: SlackNotificationPayload;
    [SCHEDULER_TASKS.SEND_EMAIL_NOTIFICATION]: EmailNotificationPayload;
    [SCHEDULER_TASKS.UPLOAD_GSHEETS]: GsheetsNotificationPayload;
    [SCHEDULER_TASKS.DOWNLOAD_CSV]: DownloadCsvPayload;
    [SCHEDULER_TASKS.UPLOAD_GSHEET_FROM_QUERY]: UploadMetricGsheetPayload;
    [SCHEDULER_TASKS.VALIDATE_PROJECT]: ValidateProjectPayload;
    [SCHEDULER_TASKS.COMPILE_PROJECT]: CompileProjectPayload;
    [SCHEDULER_TASKS.CREATE_PROJECT_WITH_COMPILE]: SchedulerCreateProjectWithCompilePayload;
    [SCHEDULER_TASKS.TEST_AND_COMPILE_PROJECT]: CompileProjectPayload;
    [SCHEDULER_TASKS.SEMANTIC_LAYER_QUERY]: SemanticLayerQueryPayload;
    [SCHEDULER_TASKS.SQL_RUNNER]: SqlRunnerPayload;
    [SCHEDULER_TASKS.SQL_RUNNER_PIVOT_QUERY]: SqlRunnerPivotQueryPayload;
    [SCHEDULER_TASKS.REPLACE_CUSTOM_FIELDS]: ReplaceCustomFieldsPayload;
    [SCHEDULER_TASKS.INDEX_CATALOG]: SchedulerIndexCatalogJobPayload;
    [SCHEDULER_TASKS.GENERATE_DAILY_JOBS]: TraceTaskBase;
    [SCHEDULER_TASKS.EXPORT_CSV_DASHBOARD]: ExportCsvDashboardPayload;
}
