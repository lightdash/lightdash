import includes from 'lodash/includes';
import {
    type AiAgentEvalRunJobPayload,
    type AiAgentReviewClassifierJobPayload,
    type AiAgentReviewRemediationPreviewJobPayload,
    type AiAgentReviewWritebackJobPayload,
    type ChartReference,
    type DataAppClaudeModel,
    type DataAppTemplate,
    type EmbedArtifactVersionJobPayload,
    type GenerateArtifactQuestionJobPayload,
    type PollWritebackPreviewJobPayload,
    type SlackPromptJobPayload,
} from '../ee';
import { type SchedulerIndexCatalogJobPayload } from './catalog';
import { type UploadMetricGsheetPayload } from './gdrive';
import { type RenameResourcesPayload } from './rename';
import {
    type CompileProjectPayload,
    type DownloadAsyncQueryResultsPayload,
    type EmailBatchNotificationPayload,
    type EmailNotificationPayload,
    type ExportCsvDashboardPayload,
    type GoogleChatBatchNotificationPayload,
    type GoogleChatNotificationPayload,
    type GsheetsNotificationPayload,
    type ManagedAgentHeartbeatPayload,
    type MaterializePreAggregatePayload,
    type MsTeamsBatchNotificationPayload,
    type MsTeamsNotificationPayload,
    type ReplaceCustomFieldsPayload,
    type ScheduledDeliveryPayload,
    type SchedulerCreateProjectWithCompilePayload,
    type SlackBatchNotificationPayload,
    type SlackNotificationPayload,
    type SyncSlackChannelsPayload,
    type TraceTaskBase,
    type ValidateProjectPayload,
} from './scheduler';
import {
    type SqlRunnerPayload,
    type SqlRunnerPivotQueryPayload,
} from './sqlRunner';

export type AppGeneratePipelineJobPayload = TraceTaskBase & {
    appUuid: string;
    version: number;
    prompt: string;
    template?: DataAppTemplate; // starter template selected on creation; absent on iteration
    imageIds?: string[];
    isIteration: boolean;
    chartReferences?: ChartReference[];
    // Claude model the user picked for this version. Absent on jobs enqueued
    // before the picker shipped — the pipeline falls back to
    // DEFAULT_DATA_APP_CLAUDE_MODEL in that case.
    claudeModel?: DataAppClaudeModel;
    // Theme (org design) resolved at enqueue time. `null` means no theme was
    // chosen and no org default exists — the worker skips the sandbox copy
    // and system-prompt augmentation entirely. Absent on jobs enqueued
    // before the theme picker shipped.
    designUuid?: string | null;
};

export const EE_SCHEDULER_TASKS = {
    SLACK_AI_PROMPT: 'slackAiPrompt',
    AI_AGENT_EVAL_RESULT: 'aiAgentEvalResult',
    AI_AGENT_REVIEW_CLASSIFIER: 'aiAgentReviewClassifier',
    AI_AGENT_REVIEW_WRITEBACK: 'aiAgentReviewWriteback',
    AI_AGENT_REVIEW_REMEDIATION_PREVIEW: 'aiAgentReviewRemediationPreview',
    EMBED_ARTIFACT_VERSION: 'embedArtifactVersion',
    GENERATE_ARTIFACT_QUESTION: 'generateArtifactQuestion',
    APP_GENERATE_PIPELINE: 'appGeneratePipeline',
    SWEEP_STALE_APP_LOCKS: 'sweepStaleAppLocks',
    POLL_WRITEBACK_PREVIEW: 'pollWritebackPreview',
} as const;

export const SCHEDULER_TASKS = {
    HANDLE_SCHEDULED_DELIVERY: 'handleScheduledDelivery',
    // Legacy individual notification tasks (deprecated, kept for backwards compatibility)
    SEND_SLACK_NOTIFICATION: 'sendSlackNotification',
    SEND_EMAIL_NOTIFICATION: 'sendEmailNotification',
    SEND_MSTEAMS_NOTIFICATION: 'sendMsTeamsNotification',
    SEND_GOOGLE_CHAT_NOTIFICATION: 'sendGoogleChatNotification',
    // Batch notification tasks - one job per delivery type
    SEND_SLACK_BATCH_NOTIFICATION: 'sendSlackBatchNotification',
    SEND_EMAIL_BATCH_NOTIFICATION: 'sendEmailBatchNotification',
    SEND_MSTEAMS_BATCH_NOTIFICATION: 'sendMsTeamsBatchNotification',
    SEND_GOOGLE_CHAT_BATCH_NOTIFICATION: 'sendGoogleChatBatchNotification',
    UPLOAD_GSHEETS: 'uploadGsheets',
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
    MATERIALIZE_PRE_AGGREGATE: 'materializePreAggregate',
    CLEAN_QUERY_HISTORY: 'cleanQueryHistory',
    DOWNLOAD_ASYNC_QUERY_RESULTS: 'downloadAsyncQueryResults',
    SYNC_SLACK_CHANNELS: 'syncSlackChannels',
    GENERATE_SLACK_CHANNEL_SYNC_JOBS: 'generateSlackChannelSyncJobs',
    CHECK_FOR_STUCK_JOBS: 'checkForStuckJobs',
    CLEAN_DEPLOY_SESSIONS: 'cleanDeploySessions',
    MANAGED_AGENT_HEARTBEAT: 'managedAgentHeartbeat',
    CLEAN_EXPIRED_PREVIEWS: 'cleanExpiredPreviews',
    INGEST_PROJECT_CONTEXT: 'ingestProjectContext',
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
    [SCHEDULER_TASKS.SEND_GOOGLE_CHAT_NOTIFICATION]: GoogleChatNotificationPayload;
    // Batch notification tasks
    [SCHEDULER_TASKS.SEND_SLACK_BATCH_NOTIFICATION]: SlackBatchNotificationPayload;
    [SCHEDULER_TASKS.SEND_EMAIL_BATCH_NOTIFICATION]: EmailBatchNotificationPayload;
    [SCHEDULER_TASKS.SEND_MSTEAMS_BATCH_NOTIFICATION]: MsTeamsBatchNotificationPayload;
    [SCHEDULER_TASKS.SEND_GOOGLE_CHAT_BATCH_NOTIFICATION]: GoogleChatBatchNotificationPayload;
    [SCHEDULER_TASKS.UPLOAD_GSHEETS]: GsheetsNotificationPayload;
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
    [SCHEDULER_TASKS.MATERIALIZE_PRE_AGGREGATE]: MaterializePreAggregatePayload;
    [SCHEDULER_TASKS.CLEAN_QUERY_HISTORY]: TraceTaskBase;
    [SCHEDULER_TASKS.DOWNLOAD_ASYNC_QUERY_RESULTS]: DownloadAsyncQueryResultsPayload;
    [SCHEDULER_TASKS.SYNC_SLACK_CHANNELS]: SyncSlackChannelsPayload;
    [SCHEDULER_TASKS.GENERATE_SLACK_CHANNEL_SYNC_JOBS]: TraceTaskBase;
    [SCHEDULER_TASKS.CHECK_FOR_STUCK_JOBS]: TraceTaskBase;
    [SCHEDULER_TASKS.CLEAN_DEPLOY_SESSIONS]: TraceTaskBase;
    [SCHEDULER_TASKS.MANAGED_AGENT_HEARTBEAT]: ManagedAgentHeartbeatPayload;
    [SCHEDULER_TASKS.CLEAN_EXPIRED_PREVIEWS]: TraceTaskBase;
    [SCHEDULER_TASKS.INGEST_PROJECT_CONTEXT]: TraceTaskBase;
    [SCHEDULER_TASKS.AI_AGENT_EVAL_RESULT]: AiAgentEvalRunJobPayload;
    [SCHEDULER_TASKS.AI_AGENT_REVIEW_CLASSIFIER]: AiAgentReviewClassifierJobPayload;
    [SCHEDULER_TASKS.AI_AGENT_REVIEW_WRITEBACK]: AiAgentReviewWritebackJobPayload;
    [SCHEDULER_TASKS.AI_AGENT_REVIEW_REMEDIATION_PREVIEW]: AiAgentReviewRemediationPreviewJobPayload;
    [SCHEDULER_TASKS.EMBED_ARTIFACT_VERSION]: EmbedArtifactVersionJobPayload;
    [SCHEDULER_TASKS.GENERATE_ARTIFACT_QUESTION]: GenerateArtifactQuestionJobPayload;
    [SCHEDULER_TASKS.APP_GENERATE_PIPELINE]: AppGeneratePipelineJobPayload;
    [SCHEDULER_TASKS.SWEEP_STALE_APP_LOCKS]: TraceTaskBase;
    [SCHEDULER_TASKS.POLL_WRITEBACK_PREVIEW]: PollWritebackPreviewJobPayload;
}

export interface EETaskPayloadMap {
    [EE_SCHEDULER_TASKS.SLACK_AI_PROMPT]: SlackPromptJobPayload;
    [EE_SCHEDULER_TASKS.AI_AGENT_EVAL_RESULT]: AiAgentEvalRunJobPayload;
    [EE_SCHEDULER_TASKS.AI_AGENT_REVIEW_CLASSIFIER]: AiAgentReviewClassifierJobPayload;
    [EE_SCHEDULER_TASKS.AI_AGENT_REVIEW_WRITEBACK]: AiAgentReviewWritebackJobPayload;
    [EE_SCHEDULER_TASKS.AI_AGENT_REVIEW_REMEDIATION_PREVIEW]: AiAgentReviewRemediationPreviewJobPayload;
    [EE_SCHEDULER_TASKS.EMBED_ARTIFACT_VERSION]: EmbedArtifactVersionJobPayload;
    [EE_SCHEDULER_TASKS.GENERATE_ARTIFACT_QUESTION]: GenerateArtifactQuestionJobPayload;
    [EE_SCHEDULER_TASKS.APP_GENERATE_PIPELINE]: AppGeneratePipelineJobPayload;
    [EE_SCHEDULER_TASKS.SWEEP_STALE_APP_LOCKS]: TraceTaskBase;
    [EE_SCHEDULER_TASKS.POLL_WRITEBACK_PREVIEW]: PollWritebackPreviewJobPayload;
}

export type SchedulerTaskName =
    (typeof SCHEDULER_TASKS)[keyof typeof SCHEDULER_TASKS];

export const isSchedulerTaskName = (task: string): task is SchedulerTaskName =>
    includes(ALL_TASK_NAMES, task); // Had to use includes to avoid type error from Object.values().includes(string) related to union types https://github.com/microsoft/TypeScript/issues/46186
