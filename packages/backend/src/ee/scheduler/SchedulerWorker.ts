import {
    EE_SCHEDULER_TASKS,
    getErrorMessage,
    getManagedAgentScheduleCron,
    isSchedulerTaskName,
    SCHEDULER_TASKS,
    SchedulerJobStatus,
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
import { AiAgentAdminService } from '../services/AiAgentAdminService';
import { AiAgentReviewClassifierService } from '../services/AiAgentReviewClassifierService';
import { type AiAgentReviewNotificationService } from '../services/AiAgentReviewNotificationService';
import { AiAgentService } from '../services/AiAgentService/AiAgentService';
import { AiSchedulerService } from '../services/AiSchedulerService';
import { AppGenerateService } from '../services/AppGenerateService/AppGenerateService';
import type { EmbedService } from '../services/EmbedService/EmbedService';
import { ManagedAgentService } from '../services/ManagedAgentService/ManagedAgentService';
import { ProjectContextService } from '../services/ProjectContextService/ProjectContextService';
import { sendReviewNotification } from './tasks/sendReviewNotification';

const AI_AGENT_EVAL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const AI_AGENT_REVIEW_REMEDIATION_RUN_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const AI_AGENT_REVIEW_CLASSIFIER_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes
const AI_AGENT_REVIEW_WRITEBACK_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const APP_GENERATE_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes

type CommercialSchedulerWorkerArguments = SchedulerWorkerArguments & {
    aiAgentService: AiAgentService;
    aiSchedulerService: AiSchedulerService;
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
};

export class CommercialSchedulerWorker extends SchedulerWorker {
    protected readonly aiAgentService: AiAgentService;

    protected readonly aiSchedulerService: AiSchedulerService;

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

    constructor(args: CommercialSchedulerWorkerArguments) {
        super(args);
        this.aiAgentService = args.aiAgentService;
        this.aiSchedulerService = args.aiSchedulerService;
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
    }

    protected override async getScheduledReport(
        schedulerUuid: string | undefined,
        organizationUuid: string,
    ): Promise<string | null> {
        if (!schedulerUuid) {
            return null;
        }
        return this.aiSchedulerService.generateScheduledReport(
            schedulerUuid,
            organizationUuid,
        );
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
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        EE_SCHEDULER_TASKS.APP_GENERATE_PIPELINE,
                        helpers.job.id,
                        helpers.job.run_at,
                        payload,
                        async () => {
                            await this.appGenerateService.runPipeline(payload);
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
                            );
                        }
                    },
                );
            },
            [EE_SCHEDULER_TASKS.SWEEP_STALE_APP_LOCKS]: async () => {
                await this.appGenerateService.sweepStaleLocks();
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
        };
    }
}
