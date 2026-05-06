import {
    EE_SCHEDULER_TASKS,
    getErrorMessage,
    getManagedAgentScheduleCron,
    isSchedulerTaskName,
    SCHEDULER_TASKS,
    SchedulerJobStatus,
} from '@lightdash/common';
import Logger from '../../logging/logger';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { tryJobOrTimeout } from '../../scheduler/SchedulerJobTimeout';
import { SchedulerTaskArguments } from '../../scheduler/SchedulerTask';
import { SchedulerWorker } from '../../scheduler/SchedulerWorker';
import { TypedEETaskList } from '../../scheduler/types';
import { AiAgentService } from '../services/AiAgentService/AiAgentService';
import { AppGenerateService } from '../services/AppGenerateService/AppGenerateService';
import type { EmbedService } from '../services/EmbedService/EmbedService';
import { ManagedAgentService } from '../services/ManagedAgentService/ManagedAgentService';

const AI_AGENT_EVAL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const APP_GENERATE_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes

type CommercialSchedulerWorkerArguments = SchedulerTaskArguments & {
    aiAgentService: AiAgentService;
    embedService: EmbedService;
    managedAgentService: ManagedAgentService;
    appGenerateService: AppGenerateService;
};

export class CommercialSchedulerWorker extends SchedulerWorker {
    protected readonly aiAgentService: AiAgentService;

    protected readonly embedService: EmbedService;

    protected readonly managedAgentService: ManagedAgentService;

    protected readonly appGenerateService: AppGenerateService;

    constructor(args: CommercialSchedulerWorkerArguments) {
        super(args);
        this.aiAgentService = args.aiAgentService;
        this.embedService = args.embedService;
        this.managedAgentService = args.managedAgentService;
        this.appGenerateService = args.appGenerateService;
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
            [SCHEDULER_TASKS.MANAGED_AGENT_HEARTBEAT]: async (payload) => {
                const { projectUuid } = payload;
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
                    `Running managed agent heartbeat for project ${projectUuid}`,
                );

                try {
                    await this.managedAgentService.runHeartbeat(projectUuid);
                    Logger.info(
                        `Heartbeat completed for project ${projectUuid}`,
                    );
                } catch (error) {
                    Logger.error(
                        `Error during heartbeat for project ${projectUuid}:`,
                        error,
                    );
                } finally {
                    const schedule =
                        getManagedAgentScheduleCron(settings.schedule) ??
                        this.lightdashConfig.managedAgent.schedule;
                    await this.schedulerClient.scheduleManagedAgentHeartbeat(
                        schedule,
                        projectUuid,
                    );
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
