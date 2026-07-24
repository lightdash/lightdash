import { subject } from '@casl/ability';
import {
    EE_SCHEDULER_TASKS,
    ForbiddenError,
    getErrorMessage,
    getManagedAgentScheduleCron,
    isSchedulerTaskName,
    SCHEDULER_TASKS,
    SchedulerJobStatus,
    type Account,
    type ExportContentPayload,
} from '@lightdash/common';
import Logger from '../../logging/logger';
import { type OpenIdIdentityModel } from '../../models/OpenIdIdentitiesModel';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { tryJobOrTimeout } from '../../scheduler/SchedulerJobTimeout';
import {
    SchedulerWorker,
    SchedulerWorkerArguments,
} from '../../scheduler/SchedulerWorker';
import { TypedEETaskList } from '../../scheduler/types';
import { type AiAgentReviewClassifierModel } from '../models/AiAgentReviewClassifierModel';
import { type AiAgentReviewNotificationModel } from '../models/AiAgentReviewNotificationModel';
import { type McpToolCallModel } from '../models/McpToolCallModel';
import { AiAgentAdminService } from '../services/AiAgentAdminService';
import { AiAgentReviewClassifierService } from '../services/AiAgentReviewClassifierService';
import { type AiAgentReviewNotificationService } from '../services/AiAgentReviewNotificationService';
import { AiAgentService } from '../services/AiAgentService/AiAgentService';
import { type AiDeepResearchService } from '../services/AiDeepResearchService/AiDeepResearchService';
import type { AiWritebackService } from '../services/AiWritebackService/AiWritebackService';
import { AppGenerateService } from '../services/AppGenerateService/AppGenerateService';
import type { EmbedService } from '../services/EmbedService/EmbedService';
import { ManagedAgentService } from '../services/ManagedAgentService/ManagedAgentService';
import { type OnboardingAgentService } from '../services/OnboardingAgentService/OnboardingAgentService';
import { ProjectContextService } from '../services/ProjectContextService/ProjectContextService';
import { sendReviewNotification } from './tasks/sendReviewNotification';

const MCP_TOOL_CALL_RETENTION_DAYS = 90;
const AI_AGENT_EVAL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const AI_AGENT_REVIEW_REMEDIATION_RUN_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const AI_AGENT_REVIEW_CLASSIFIER_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes
const AI_AGENT_REVIEW_WRITEBACK_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const APP_GENERATE_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes
const AI_WRITEBACK_TIMEOUT_MS = 30 * 60 * 1000;
const AGENT_ONBOARDING_TIMEOUT_MS = 60 * 60 * 1000;

type CommercialSchedulerWorkerArguments = SchedulerWorkerArguments & {
    aiAgentService: AiAgentService;
    aiWritebackService: AiWritebackService;
    aiDeepResearchService: AiDeepResearchService;
    onboardingAgentService: OnboardingAgentService;
    aiAgentReviewClassifierService: AiAgentReviewClassifierService;
    aiAgentReviewClassifierModel: AiAgentReviewClassifierModel;
    aiAgentReviewNotificationModel: AiAgentReviewNotificationModel;
    aiAgentReviewNotificationService: AiAgentReviewNotificationService;
    aiAgentAdminService: AiAgentAdminService;
    embedService: EmbedService;
    managedAgentService: ManagedAgentService;
    appGenerateService: AppGenerateService;
    projectContextService: ProjectContextService;
    projectModel: ProjectModel;
    openIdIdentityModel: OpenIdIdentityModel;
    mcpToolCallModel: McpToolCallModel;
};

export class CommercialSchedulerWorker extends SchedulerWorker {
    protected readonly aiAgentService: AiAgentService;

    protected readonly aiWritebackService: AiWritebackService;

    protected readonly aiDeepResearchService: AiDeepResearchService;

    protected readonly onboardingAgentService: OnboardingAgentService;

    protected readonly aiAgentReviewClassifierService: AiAgentReviewClassifierService;

    protected readonly aiAgentReviewClassifierModel: AiAgentReviewClassifierModel;

    protected readonly aiAgentReviewNotificationModel: AiAgentReviewNotificationModel;

    protected readonly aiAgentReviewNotificationService: AiAgentReviewNotificationService;

    protected readonly aiAgentAdminService: AiAgentAdminService;

    protected readonly embedService: EmbedService;

    protected readonly managedAgentService: ManagedAgentService;

    protected readonly appGenerateService: AppGenerateService;

    protected readonly projectContextService: ProjectContextService;

    protected readonly projectModel: ProjectModel;

    protected readonly openIdIdentityModel: OpenIdIdentityModel;

    protected readonly mcpToolCallModel: McpToolCallModel;

    constructor(args: CommercialSchedulerWorkerArguments) {
        super(args);
        this.aiAgentService = args.aiAgentService;
        this.aiWritebackService = args.aiWritebackService;
        this.aiDeepResearchService = args.aiDeepResearchService;
        this.onboardingAgentService = args.onboardingAgentService;
        this.aiAgentReviewClassifierService =
            args.aiAgentReviewClassifierService;
        this.aiAgentReviewClassifierModel = args.aiAgentReviewClassifierModel;
        this.aiAgentReviewNotificationModel =
            args.aiAgentReviewNotificationModel;
        this.aiAgentReviewNotificationService =
            args.aiAgentReviewNotificationService;
        this.aiAgentAdminService = args.aiAgentAdminService;
        this.embedService = args.embedService;
        this.managedAgentService = args.managedAgentService;
        this.appGenerateService = args.appGenerateService;
        this.projectContextService = args.projectContextService;
        this.projectModel = args.projectModel;
        this.openIdIdentityModel = args.openIdIdentityModel;
        this.mcpToolCallModel = args.mcpToolCallModel;
    }

    protected getCronItems() {
        return [
            ...super.getCronItems(),
            {
                task: EE_SCHEDULER_TASKS.SWEEP_STALE_APP_LOCKS,
                pattern: '*/2 * * * *', // Every 2 minutes
                options: {
                    backfillPeriod: 5 * 60 * 1000, // 5 min
                    maxAttempts: 1,
                },
            },
            {
                task: EE_SCHEDULER_TASKS.SWEEP_STALE_AI_WRITEBACK_RUNS,
                pattern: '*/2 * * * *', // Every 2 minutes
                options: {
                    backfillPeriod: 5 * 60 * 1000, // 5 min
                    maxAttempts: 1,
                },
            },
            {
                task: EE_SCHEDULER_TASKS.SWEEP_STALE_AI_DEEP_RESEARCH_RUNS,
                pattern: '*/2 * * * *',
                options: {
                    backfillPeriod: 5 * 60 * 1000,
                    maxAttempts: 1,
                },
            },
            {
                task: EE_SCHEDULER_TASKS.CLEAN_MCP_TOOL_CALLS,
                pattern: '45 0 * * *', // 00:45 UTC daily
                options: {
                    backfillPeriod: 24 * 3600 * 1000, // 24 hours in ms
                    maxAttempts: 3,
                },
            },
        ];
    }

    protected getTaskList(): Partial<TypedEETaskList> {
        return Object.fromEntries(
            Object.entries(this.getFullTaskList()).filter(
                ([taskKey]) =>
                    isSchedulerTaskName(taskKey) &&
                    this.enabledTasks.includes(taskKey),
            ),
        );
    }

    protected getFullTaskList(): TypedEETaskList {
        return {
            ...super.getFullTaskList(),
            [EE_SCHEDULER_TASKS.SLACK_AI_PROMPT]: async (payload, _helpers) => {
                await this.aiAgentService.replyToSlackPrompt(
                    payload.slackPromptUuid,
                );
            },
            [EE_SCHEDULER_TASKS.CLEAN_MCP_TOOL_CALLS]: async () => {
                Logger.info('Starting MCP tool call cleanup job');
                const deleted =
                    await this.mcpToolCallModel.deleteToolCallsOlderThan(
                        MCP_TOOL_CALL_RETENTION_DAYS,
                    );
                Logger.info(
                    `MCP tool call cleanup completed. Records deleted: ${deleted}`,
                );
            },
            [EE_SCHEDULER_TASKS.AI_AGENT_REVIEW_REMEDIATION_PREVIEW]: async (
                payload,
                _helpers,
            ) => {
                await this.aiAgentAdminService.pollReviewRemediationPreview(
                    payload,
                );
            },
            [EE_SCHEDULER_TASKS.AI_AGENT_REVIEW_REMEDIATION_COMPILE]: async (
                payload,
                _helpers,
            ) => {
                await this.aiAgentAdminService.pollReviewRemediationCompile(
                    payload,
                );
            },
            [EE_SCHEDULER_TASKS.AI_AGENT_REVIEW_REMEDIATION_RUN]: async (
                payload,
                helpers,
            ) => {
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        EE_SCHEDULER_TASKS.AI_AGENT_REVIEW_REMEDIATION_RUN,
                        helpers.job.id,
                        helpers.job.run_at,
                        payload,
                        async () => {
                            await this.aiAgentService.executeReviewRemediationRun(
                                payload,
                            );
                            await this.aiAgentAdminService.recordReviewRemediationVerified(
                                payload,
                            );
                        },
                    ),
                    helpers.job,
                    AI_AGENT_REVIEW_REMEDIATION_RUN_TIMEOUT_MS,
                    async (job, e) => {
                        // The preview stays usable on failure — the admin can
                        // still retry the question manually from the thread.
                        await this.schedulerService.logSchedulerJob({
                            task: EE_SCHEDULER_TASKS.AI_AGENT_REVIEW_REMEDIATION_RUN,
                            jobId: job.id,
                            scheduledTime: job.run_at,
                            status: SchedulerJobStatus.ERROR,
                            details: {
                                error: getErrorMessage(e),
                                projectUuid: payload.projectUuid,
                                organizationUuid: payload.organizationUuid,
                                createdByUserUuid: payload.userUuid,
                                agentUuid: payload.agentUuid,
                                threadUuid: payload.threadUuid,
                                remediationUuid: payload.remediationUuid,
                                fingerprint: payload.fingerprint,
                            },
                        });
                    },
                );
            },
            [EE_SCHEDULER_TASKS.EMBED_ARTIFACT_VERSION]: async (
                payload,
                _helpers,
            ) => {
                await this.aiAgentService.embedArtifactVersion(payload);
            },
            [EE_SCHEDULER_TASKS.GENERATE_ARTIFACT_QUESTION]: async (
                payload,
                _helpers,
            ) => {
                await this.aiAgentService.generateArtifactQuestion(payload);
            },
            [EE_SCHEDULER_TASKS.AI_AGENT_EVAL_RESULT]: async (
                payload,
                helpers,
            ) => {
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        EE_SCHEDULER_TASKS.AI_AGENT_EVAL_RESULT,
                        helpers.job.id,
                        helpers.job.run_at,
                        payload,
                        async () => {
                            await this.aiAgentService.executeEvalResult(
                                payload,
                            );
                        },
                    ),
                    helpers.job,
                    AI_AGENT_EVAL_TIMEOUT_MS,
                    async (job, e) => {
                        await this.aiAgentService.updateEvalRunResult(
                            payload.evalRunUuid,
                            payload.evalRunResultUuid,
                            new Error('Evaluation task timed out', {
                                cause: e,
                            }),
                        );
                        await this.schedulerService.logSchedulerJob({
                            task: EE_SCHEDULER_TASKS.AI_AGENT_EVAL_RESULT,
                            jobId: job.id,
                            scheduledTime: job.run_at,
                            status: SchedulerJobStatus.ERROR,
                            details: {
                                error: getErrorMessage(e),
                                projectUuid: payload.projectUuid,
                                organizationUuid: payload.organizationUuid,
                                createdByUserUuid: payload.userUuid,
                                agentUuid: payload.agentUuid,
                                evalRunUuid: payload.evalRunUuid,
                                evalRunResultUuid: payload.evalRunResultUuid,
                            },
                        });
                    },
                );
            },
            [EE_SCHEDULER_TASKS.AI_AGENT_REVIEW_CLASSIFIER]: async (
                payload,
                helpers,
            ) => {
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        EE_SCHEDULER_TASKS.AI_AGENT_REVIEW_CLASSIFIER,
                        helpers.job.id,
                        helpers.job.run_at,
                        payload,
                        async () => {
                            await this.aiAgentReviewClassifierService.runLiveEvent(
                                {
                                    ...payload,
                                    requestedByUserUuid: payload.userUuid,
                                },
                            );
                        },
                    ),
                    helpers.job,
                    AI_AGENT_REVIEW_CLASSIFIER_TIMEOUT_MS,
                    async (job, e) => {
                        await this.schedulerService.logSchedulerJob({
                            task: EE_SCHEDULER_TASKS.AI_AGENT_REVIEW_CLASSIFIER,
                            jobId: job.id,
                            scheduledTime: job.run_at,
                            status: SchedulerJobStatus.ERROR,
                            details: {
                                error: getErrorMessage(e),
                                projectUuid: payload.projectUuid,
                                organizationUuid: payload.organizationUuid,
                                agentUuid: payload.agentUuid,
                                threadUuid: payload.threadUuid,
                                promptUuid: payload.promptUuid,
                                eventType: payload.eventType,
                            },
                        });
                    },
                );
            },
            [EE_SCHEDULER_TASKS.AI_AGENT_REVIEW_WRITEBACK]: async (
                payload,
                helpers,
            ) => {
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        EE_SCHEDULER_TASKS.AI_AGENT_REVIEW_WRITEBACK,
                        helpers.job.id,
                        helpers.job.run_at,
                        payload,
                        async () => {
                            await this.aiAgentAdminService.runReviewItemWritebackJob(
                                payload,
                            );
                        },
                    ),
                    helpers.job,
                    AI_AGENT_REVIEW_WRITEBACK_TIMEOUT_MS,
                    async (job, e) => {
                        await this.aiAgentAdminService.failReviewItemWritebackJob(
                            {
                                fingerprint: payload.fingerprint,
                                organizationUuid: payload.organizationUuid,
                                message: getErrorMessage(e),
                            },
                        );
                        await this.schedulerService.logSchedulerJob({
                            task: EE_SCHEDULER_TASKS.AI_AGENT_REVIEW_WRITEBACK,
                            jobId: job.id,
                            scheduledTime: job.run_at,
                            status: SchedulerJobStatus.ERROR,
                            details: {
                                error: getErrorMessage(e),
                                organizationUuid: payload.organizationUuid,
                                projectUuid: payload.projectUuid,
                                fingerprint: payload.fingerprint,
                            },
                        });
                    },
                );
            },
            [SCHEDULER_TASKS.MANAGED_AGENT_HEARTBEAT]: async (payload) => {
                const { projectUuid } = payload;
                const triggeredBy = payload.triggeredBy ?? 'cron';
                const settings = (
                    await this.managedAgentService.getEnabledProjects()
                ).find((project) => project.projectUuid === projectUuid);

                if (!settings) {
                    Logger.info(
                        `Managed agent disabled for project ${projectUuid}, stopping heartbeat loop`,
                    );
                    return;
                }

                const aiAutopilotEnabled =
                    await this.managedAgentService.isAiAutopilotEnabledForProject(
                        settings,
                    );
                if (!aiAutopilotEnabled) {
                    Logger.info(
                        `AI autopilot feature flag disabled for project ${projectUuid}, skipping managed agent heartbeat`,
                    );
                    return;
                }

                Logger.info(
                    `Running managed agent heartbeat for project ${projectUuid} (${triggeredBy})`,
                );

                const { runUuid } = await this.managedAgentService.startRun(
                    projectUuid,
                    triggeredBy,
                );

                try {
                    await this.managedAgentService.runHeartbeat(
                        projectUuid,
                        runUuid,
                    );
                    Logger.info(
                        `Heartbeat completed for project ${projectUuid}`,
                    );
                } catch (error) {
                    Logger.error(
                        `Error during heartbeat for project ${projectUuid}:`,
                        error,
                    );
                } finally {
                    if (triggeredBy === 'cron') {
                        const schedule =
                            getManagedAgentScheduleCron(settings.schedule) ??
                            this.lightdashConfig.managedAgent.schedule;
                        await this.schedulerClient.scheduleManagedAgentHeartbeat(
                            schedule,
                            projectUuid,
                        );
                    }
                }
            },
            [EE_SCHEDULER_TASKS.APP_GENERATE_PIPELINE]: async (
                payload,
                helpers,
            ) => {
                const schedulerWaitMs = Math.max(
                    Date.now() - helpers.job.run_at.getTime(),
                    0,
                );
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        EE_SCHEDULER_TASKS.APP_GENERATE_PIPELINE,
                        helpers.job.id,
                        helpers.job.run_at,
                        payload,
                        async () => {
                            await this.appGenerateService.runPipeline(
                                payload,
                                schedulerWaitMs,
                            );
                        },
                    ),
                    helpers.job,
                    APP_GENERATE_TIMEOUT_MS,
                    async (_job, e) => {
                        const marked = await this.appGenerateService.markError(
                            payload.appUuid,
                            payload.version,
                            e,
                            'Build timed out. Please try again.',
                        );
                        if (marked) {
                            this.appGenerateService.trackTimeoutFailure(
                                payload,
                                e,
                                schedulerWaitMs,
                            );
                        }
                    },
                );
            },
            [EE_SCHEDULER_TASKS.APP_BUILD_FROM_SOURCE]: async (
                payload,
                helpers,
            ) => {
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        EE_SCHEDULER_TASKS.APP_BUILD_FROM_SOURCE,
                        helpers.job.id,
                        helpers.job.run_at,
                        payload,
                        async () => {
                            await this.appGenerateService.runBuildFromSourcePipeline(
                                payload,
                            );
                        },
                    ),
                    helpers.job,
                    APP_GENERATE_TIMEOUT_MS,
                    async (_job, e) => {
                        // trackTimeoutFailure is typed to AppGeneratePipelineJobPayload and
                        // cannot accept AppBuildFromSourceJobPayload, so omitted here.
                        await this.appGenerateService.markError(
                            payload.appUuid,
                            payload.version,
                            e,
                            'Build timed out. Please try again.',
                        );
                    },
                );
            },
            [EE_SCHEDULER_TASKS.AI_WRITEBACK_PIPELINE]: async (
                payload,
                helpers,
            ) => {
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        EE_SCHEDULER_TASKS.AI_WRITEBACK_PIPELINE,
                        helpers.job.id,
                        helpers.job.run_at,
                        payload,
                        async () => {
                            await this.aiWritebackService.runPipeline(payload);
                        },
                    ),
                    helpers.job,
                    AI_WRITEBACK_TIMEOUT_MS,
                    async (_job, e) => {
                        await this.aiWritebackService.markRunError(
                            payload.aiWritebackRunUuid,
                            getErrorMessage(e),
                        );
                    },
                );
            },
            [EE_SCHEDULER_TASKS.AGENT_ONBOARDING_RUN]: async (
                payload,
                helpers,
            ) => {
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        EE_SCHEDULER_TASKS.AGENT_ONBOARDING_RUN,
                        helpers.job.id,
                        helpers.job.run_at,
                        payload,
                        async () => {
                            await this.onboardingAgentService.executeRun(
                                payload,
                            );
                        },
                    ),
                    helpers.job,
                    AGENT_ONBOARDING_TIMEOUT_MS,
                    async () => {
                        await this.onboardingAgentService.markRunTimedOut(
                            payload.agentOnboardingRunUuid,
                        );
                    },
                );
            },
            [EE_SCHEDULER_TASKS.AI_DEEP_RESEARCH]: async (payload, helpers) => {
                await SchedulerClient.processJob(
                    EE_SCHEDULER_TASKS.AI_DEEP_RESEARCH,
                    helpers.job.id,
                    helpers.job.run_at,
                    payload,
                    async () => {
                        await this.aiDeepResearchService.executeRun(payload);
                    },
                );
            },
            [EE_SCHEDULER_TASKS.AI_AGENT_EDIT_DBT_PROJECT_PIPELINE]: async (
                payload,
                helpers,
            ) => {
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        EE_SCHEDULER_TASKS.AI_AGENT_EDIT_DBT_PROJECT_PIPELINE,
                        helpers.job.id,
                        helpers.job.run_at,
                        payload,
                        async () => {
                            await this.aiAgentService.runEditDbtProjectPipeline(
                                payload,
                            );
                        },
                    ),
                    helpers.job,
                    AI_WRITEBACK_TIMEOUT_MS,
                    async (_job, e) => {
                        const runMarkedError =
                            await this.aiWritebackService.markRunError(
                                payload.aiWritebackRunUuid,
                                getErrorMessage(e),
                            );
                        if (runMarkedError) {
                            await this.aiAgentService.markEditDbtProjectToolResultError(
                                payload.promptUuid,
                                payload.toolCallId,
                                `Error running AI writeback: ${getErrorMessage(e)}`,
                            );
                        }
                    },
                );
            },
            [EE_SCHEDULER_TASKS.SWEEP_STALE_APP_LOCKS]: async () => {
                await this.appGenerateService.sweepStaleLocks();
            },
            [EE_SCHEDULER_TASKS.SWEEP_STALE_AI_WRITEBACK_RUNS]: async () => {
                const swept = await this.aiWritebackService.sweepStaleRuns();
                // A chat run's card reflects the tool-result row, not the run
                // row, so marking the run errored alone would leave it stuck on
                // "Working on the change". Fail the card too — mirrors the
                // dual-recovery the pipeline's timeout callback already does.
                const chatRuns = swept.filter(
                    (run) => run.promptUuid && run.toolCallId,
                );
                for (const run of chatRuns) {
                    try {
                        // eslint-disable-next-line no-await-in-loop
                        await this.aiAgentService.markEditDbtProjectToolResultError(
                            run.promptUuid!,
                            run.toolCallId!,
                            'Error running AI writeback: the run stopped unexpectedly before it finished.',
                        );
                    } catch (error) {
                        Logger.warn(
                            `Failed to fail stale writeback tool-result card for run ${run.aiWritebackRunUuid}: ${getErrorMessage(
                                error,
                            )}`,
                        );
                    }
                }
            },
            [EE_SCHEDULER_TASKS.SWEEP_STALE_AI_DEEP_RESEARCH_RUNS]:
                async () => {
                    await this.aiDeepResearchService.sweepStaleRuns();
                },
            [EE_SCHEDULER_TASKS.SEND_REVIEW_NOTIFICATION]: async (payload) => {
                await sendReviewNotification({
                    siteUrl: this.lightdashConfig.siteUrl,
                    model: this.aiAgentReviewNotificationModel,
                    service: this.aiAgentReviewNotificationService,
                    aiAgentReviewClassifierModel:
                        this.aiAgentReviewClassifierModel,
                    projectModel: this.projectModel,
                    openIdIdentityModel: this.openIdIdentityModel,
                    slackClient: this.slackClient,
                    analytics: this.analytics,
                })(payload);
            },
            [SCHEDULER_TASKS.INGEST_PROJECT_CONTEXT]: async (
                payload,
                helpers,
            ) => {
                try {
                    const user =
                        await this.userService.getSessionByUserUuidAndOrg(
                            payload.userUuid,
                            payload.organizationUuid,
                        );
                    await this.projectContextService.ingestProjectContext(
                        user,
                        payload.projectUuid,
                    );
                } catch (e) {
                    await this.schedulerService.logSchedulerJob({
                        task: SCHEDULER_TASKS.INGEST_PROJECT_CONTEXT,
                        jobId: helpers.job.id,
                        scheduledTime: helpers.job.run_at,
                        status: SchedulerJobStatus.ERROR,
                        details: {
                            error: getErrorMessage(e),
                            projectUuid: payload.projectUuid,
                            organizationUuid: payload.organizationUuid,
                        },
                    });
                    throw e;
                }
            },
            [SCHEDULER_TASKS.DOWNLOAD_ASYNC_QUERY_RESULTS]: async (
                payload,
                helpers,
            ) => {
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        SCHEDULER_TASKS.DOWNLOAD_ASYNC_QUERY_RESULTS,
                        helpers.job.id,
                        helpers.job.run_at,
                        payload,
                        async (): Promise<void> => {
                            const { encodedJwt, ...rest } = payload;
                            if (encodedJwt) {
                                // For JWT users, wrap in logWrapper so it works with scheduler logs and we can poll
                                await this.logWrapper(
                                    {
                                        task: SCHEDULER_TASKS.DOWNLOAD_ASYNC_QUERY_RESULTS,
                                        jobId: helpers.job.id,
                                        scheduledTime: helpers.job.run_at,
                                        details: {
                                            createdByUserUuid: payload.userUuid,
                                            projectUuid: payload.projectUuid,
                                            organizationUuid:
                                                payload.organizationUuid,
                                        },
                                    },
                                    async () => {
                                        const account =
                                            await this.embedService.getAccountFromJwt(
                                                rest.projectUuid,
                                                encodedJwt,
                                            );
                                        return this.asyncQueryService.download({
                                            account,
                                            ...payload,
                                        });
                                    },
                                );
                            } else {
                                // For non-JWT users, reuse the existing task
                                await this.downloadAsyncQueryResults(
                                    helpers.job.id,
                                    helpers.job.run_at,
                                    payload,
                                );
                            }
                        },
                    ),
                    helpers.job,
                    this.lightdashConfig.scheduler.jobTimeout,
                    async (job, e) => {
                        await this.schedulerService.logSchedulerJob({
                            task: SCHEDULER_TASKS.DOWNLOAD_ASYNC_QUERY_RESULTS,
                            jobId: job.id,
                            scheduledTime: job.run_at,
                            status: SchedulerJobStatus.ERROR,
                            details: {
                                createdByUserUuid: payload.userUuid,
                                error: getErrorMessage(e),
                                projectUuid: payload.projectUuid,
                                organizationUuid: payload.organizationUuid,
                            },
                        });
                    },
                );
            },
            [SCHEDULER_TASKS.EXPORT_CONTENT]: async (payload, helpers) => {
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        SCHEDULER_TASKS.EXPORT_CONTENT,
                        helpers.job.id,
                        helpers.job.run_at,
                        payload,
                        async () => {
                            const { encodedJwt } = payload;
                            if (encodedJwt) {
                                const account =
                                    await this.resolveEmbedExportAccount(
                                        helpers.job.id,
                                        helpers.job.run_at,
                                        payload,
                                        encodedJwt,
                                    );
                                await this.exportContent(
                                    helpers.job.id,
                                    helpers.job.run_at,
                                    payload,
                                    account,
                                );
                            } else {
                                await this.exportContent(
                                    helpers.job.id,
                                    helpers.job.run_at,
                                    payload,
                                );
                            }
                        },
                    ),
                    helpers.job,
                    this.lightdashConfig.scheduler.jobTimeout,
                    async (job, e) => {
                        await this.schedulerService.logSchedulerJob({
                            task: SCHEDULER_TASKS.EXPORT_CONTENT,
                            jobId: job.id,
                            scheduledTime: job.run_at,
                            status: SchedulerJobStatus.ERROR,
                            details: {
                                userUuid: payload.userUuid,
                                projectUuid: payload.projectUuid,
                                organizationUuid: payload.organizationUuid,
                                error: getErrorMessage(e),
                                createdByUserUuid: payload.userUuid,
                            },
                        });
                    },
                );
            },
        };
    }

    // Rebuilds the anonymous account from the embed JWT (re-verifying
    // signature and expiry) and re-asserts the export ability against the
    // payload, so the worker never trusts the queued job. Failures (e.g.
    // expired token) are logged as job errors so the embed's status poller
    // surfaces them instead of hanging on a SCHEDULED job forever.
    private async resolveEmbedExportAccount(
        jobId: string,
        scheduledTime: Date,
        payload: ExportContentPayload,
        encodedJwt: string,
    ): Promise<Account> {
        try {
            const account = await this.embedService.getAccountFromJwt(
                payload.projectUuid,
                encodedJwt,
            );
            if (
                account.user.ability.cannot(
                    'manage',
                    subject('ExportCsv', {
                        organizationUuid: payload.organizationUuid,
                        projectUuid: payload.projectUuid,
                        metadata: {
                            dashboardUuid: payload.resourceUuid,
                        },
                    }),
                )
            ) {
                throw new ForbiddenError(
                    'Embed token is not authorized to export this dashboard',
                );
            }
            return account;
        } catch (e) {
            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.EXPORT_CONTENT,
                jobId,
                scheduledTime,
                status: SchedulerJobStatus.ERROR,
                details: {
                    createdByUserUuid: payload.userUuid,
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                    error: getErrorMessage(e),
                },
            });
            throw e;
        }
    }
}
