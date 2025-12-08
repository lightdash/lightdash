import includes from 'lodash/includes';
import {
    type AiAgentEvalRunJobPayload,
    type EmbedArtifactVersionJobPayload,
    type GenerateArtifactQuestionJobPayload,
    type SlackPromptJobPayload,
} from '../ee';
import { type SchedulerIndexCatalogJobPayload } from './catalog';
import { type UploadMetricGsheetPayload } from './gdrive';
import { type RenameResourcesPayload } from './rename';
import {
    type CompileProjectPayload,
    type DownloadAsyncQueryResultsPayload,
    type DownloadCsvPayload,
    type EmailBatchNotificationPayload,
    type EmailNotificationPayload,
    type ExportCsvDashboardPayload,
    type GsheetsNotificationPayload,
    type MsTeamsBatchNotificationPayload,
    type MsTeamsNotificationPayload,
    type ReplaceCustomFieldsPayload,
    type ScheduledDeliveryPayload,
    type SchedulerCreateProjectWithCompilePayload,
    type SlackBatchNotificationPayload,
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
    AI_AGENT_EVAL_RESULT: 'aiAgentEvalResult',
    EMBED_ARTIFACT_VERSION: 'embedArtifactVersion',
    GENERATE_ARTIFACT_QUESTION: 'generateArtifactQuestion',
} as const;

export const SCHEDULER_TASKS = {
    HANDLE_SCHEDULED_DELIVERY: 'handleScheduledDelivery',
    // Legacy individual notification tasks (deprecated, kept for backwards compatibility)
    SEND_SLACK_NOTIFICATION: 'sendSlackNotification',
    SEND_EMAIL_NOTIFICATION: 'sendEmailNotification',
    SEND_MSTEAMS_NOTIFICATION: 'sendMsTeamsNotification',
    // Batch notification tasks - one job per delivery type
    SEND_SLACK_BATCH_NOTIFICATION: 'sendSlackBatchNotification',
    SEND_EMAIL_BATCH_NOTIFICATION: 'sendEmailBatchNotification',
    SEND_MSTEAMS_BATCH_NOTIFICATION: 'sendMsTeamsBatchNotification',
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
    CLEAN_QUERY_HISTORY: 'cleanQueryHistory',
    DOWNLOAD_ASYNC_QUERY_RESULTS: 'downloadAsyncQueryResults',
    ...EE_SCHEDULER_TASKS,
} as const;

export const ALL_TASK_NAMES: SchedulerTaskName[] =
    Object.values(SCHEDULER_TASKS);

// Map each task to its payload type
export interface TaskPayloadMap {
    [SCHEDULER_TASKS.HANDLE_SCHEDULED_DELIVERY]: ScheduledDeliveryPayload;
    // Legacy individual notification tasks (deprecated)
    [SCHEDULER_TASKS.SEND_SLACK_NOTIFICATION]: SlackNotificationPayload;
    [SCHEDULER_TASKS.SEND_EMAIL_NOTIFICATION]: EmailNotificationPayload;
    [SCHEDULER_TASKS.SEND_MSTEAMS_NOTIFICATION]: MsTeamsNotificationPayload;
    // Batch notification tasks
    [SCHEDULER_TASKS.SEND_SLACK_BATCH_NOTIFICATION]: SlackBatchNotificationPayload;
    [SCHEDULER_TASKS.SEND_EMAIL_BATCH_NOTIFICATION]: EmailBatchNotificationPayload;
    [SCHEDULER_TASKS.SEND_MSTEAMS_BATCH_NOTIFICATION]: MsTeamsBatchNotificationPayload;
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
    [SCHEDULER_TASKS.CLEAN_QUERY_HISTORY]: TraceTaskBase;
    [SCHEDULER_TASKS.DOWNLOAD_ASYNC_QUERY_RESULTS]: DownloadAsyncQueryResultsPayload;
    [SCHEDULER_TASKS.AI_AGENT_EVAL_RESULT]: AiAgentEvalRunJobPayload;
    [SCHEDULER_TASKS.EMBED_ARTIFACT_VERSION]: EmbedArtifactVersionJobPayload;
    [SCHEDULER_TASKS.GENERATE_ARTIFACT_QUESTION]: GenerateArtifactQuestionJobPayload;
}

export interface EETaskPayloadMap {
    [EE_SCHEDULER_TASKS.SLACK_AI_PROMPT]: SlackPromptJobPayload;
    [EE_SCHEDULER_TASKS.AI_AGENT_EVAL_RESULT]: AiAgentEvalRunJobPayload;
    [EE_SCHEDULER_TASKS.EMBED_ARTIFACT_VERSION]: EmbedArtifactVersionJobPayload;
    [EE_SCHEDULER_TASKS.GENERATE_ARTIFACT_QUESTION]: GenerateArtifactQuestionJobPayload;
}

export type SchedulerTaskName =
    typeof SCHEDULER_TASKS[keyof typeof SCHEDULER_TASKS];

export const isSchedulerTaskName = (task: string): task is SchedulerTaskName =>
    includes(ALL_TASK_NAMES, task); // Had to use includes to avoid type error from Object.values().includes(string) related to union types https://github.com/microsoft/TypeScript/issues/46186
