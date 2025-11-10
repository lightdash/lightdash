import {
    EE_SCHEDULER_TASKS,
    getErrorMessage,
    isSchedulerTaskName,
    SCHEDULER_TASKS,
    SchedulerJobStatus,
    type Account,
} from '@lightdash/common';
import { fromSession } from '../../auth/account';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { tryJobOrTimeout } from '../../scheduler/SchedulerJobTimeout';
import { SchedulerTaskArguments } from '../../scheduler/SchedulerTask';
import { SchedulerWorker } from '../../scheduler/SchedulerWorker';
import { TypedEETaskList } from '../../scheduler/types';
import { AiAgentService } from '../services/AiAgentService';
import type { EmbedService } from '../services/EmbedService/EmbedService';

const AI_AGENT_EVAL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes in milliseconds

type CommercialSchedulerWorkerArguments = SchedulerTaskArguments & {
    aiAgentService: AiAgentService;
    embedService: EmbedService;
};

export class CommercialSchedulerWorker extends SchedulerWorker {
    protected readonly aiAgentService: AiAgentService;

    protected readonly embedService: EmbedService;

    constructor(args: CommercialSchedulerWorkerArguments) {
        super(args);
        this.aiAgentService = args.aiAgentService;
        this.embedService = args.embedService;
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
