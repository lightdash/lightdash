import { subject } from '@casl/ability';
import {
    assertUnreachable,
    ForbiddenError,
    getErrorMessage,
    type AiPromptContextInput,
    type AiSchedulerConfig,
    type AiSchedulerResourceConfig,
    type SchedulerAndTargets,
    type SessionUser,
    type UpsertAiSchedulerConfig,
} from '@lightdash/common';
import { LightdashConfig } from '../../config/parseConfig';
import { SchedulerModel } from '../../models/SchedulerModel';
import { UserModel } from '../../models/UserModel';
import { BaseService } from '../../services/BaseService';
import { SchedulerService } from '../../services/SchedulerService/SchedulerService';
import {
    AiSchedulerModel,
    type AiSchedulerAgentConfigInternal,
} from '../models/AiSchedulerModel';
import { generateScheduledResourceReport } from './ai/agents/scheduledResourceReportGenerator';
import { getModel } from './ai/models';
import { AiAgentService } from './AiAgentService/AiAgentService';

type Dependencies = {
    aiSchedulerModel: AiSchedulerModel;
    schedulerModel: SchedulerModel;
    userModel: UserModel;
    schedulerService: SchedulerService;
    aiAgentService: AiAgentService;
    lightdashConfig: LightdashConfig;
};

// Joins a (read-only) OSS scheduler with its EE ai_scheduler config and runs
// the agent. The OSS scheduler layer stays AI-free.
export class AiSchedulerService extends BaseService {
    private readonly aiSchedulerModel: AiSchedulerModel;

    private readonly schedulerModel: SchedulerModel;

    private readonly userModel: UserModel;

    private readonly schedulerService: SchedulerService;

    private readonly aiAgentService: AiAgentService;

    private readonly lightdashConfig: LightdashConfig;

    constructor(deps: Dependencies) {
        super({ serviceName: 'AiSchedulerService' });
        this.aiSchedulerModel = deps.aiSchedulerModel;
        this.schedulerModel = deps.schedulerModel;
        this.userModel = deps.userModel;
        this.schedulerService = deps.schedulerService;
        this.aiAgentService = deps.aiAgentService;
        this.lightdashConfig = deps.lightdashConfig;
    }

    // Managing a delivery's AI config requires the same `manage` permission as
    // editing the delivery itself.
    private async assertCanManageScheduler(
        user: SessionUser,
        schedulerUuid: string,
    ): Promise<{ organizationUuid: string; projectUuid: string }> {
        const scheduler = await this.schedulerModel.getScheduler(schedulerUuid);
        const { organizationUuid, projectUuid } =
            await this.schedulerService.getSchedulerProjectContext(scheduler);
        if (
            this.createAuditedAbility(user).cannot(
                'manage',
                subject('ScheduledDeliveries', {
                    organizationUuid,
                    projectUuid,
                    userUuid: scheduler.createdBy,
                    metadata: {
                        schedulerUuid,
                        createdByUserUuid: scheduler.createdBy,
                    },
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        return { organizationUuid, projectUuid };
    }

    async getConfig(
        user: SessionUser,
        schedulerUuid: string,
    ): Promise<AiSchedulerConfig | null> {
        await this.assertCanManageScheduler(user, schedulerUuid);
        const config = await this.aiSchedulerModel.find(schedulerUuid);
        if (!config || config.type === 'resource') {
            return config;
        }
        const { reportThreadUuid, ...publicConfig } = config;
        return publicConfig;
    }

    async upsertConfig(
        user: SessionUser,
        schedulerUuid: string,
        config: UpsertAiSchedulerConfig,
    ): Promise<void> {
        const { projectUuid } = await this.assertCanManageScheduler(
            user,
            schedulerUuid,
        );
        if (config.type === 'agent') {
            // Throws ForbiddenError if the user can't access the agent.
            await this.aiAgentService.getAgent(
                user,
                config.agentUuid,
                projectUuid,
            );
        }
        await this.aiSchedulerModel.upsert(schedulerUuid, config);
    }

    async removeConfig(
        user: SessionUser,
        schedulerUuid: string,
    ): Promise<void> {
        await this.assertCanManageScheduler(user, schedulerUuid);
        await this.aiSchedulerModel.remove(schedulerUuid);
    }

    // The AI report for a delivery, or null when it has no AI config.
    async generateScheduledReport(
        schedulerUuid: string,
        organizationUuid: string,
    ): Promise<string | null> {
        const config = await this.aiSchedulerModel.find(schedulerUuid);
        if (!config) {
            return null;
        }

        const scheduler =
            await this.schedulerModel.getSchedulerAndTargets(schedulerUuid);
        const user = await this.userModel.findSessionUserAndOrgByUuid(
            scheduler.createdBy,
            organizationUuid,
        );

        switch (config.type) {
            case 'agent':
                return this.generateAgentReport(
                    user,
                    schedulerUuid,
                    config,
                    scheduler,
                );
            case 'resource':
                return this.generateResourceReport(config, scheduler);
            default:
                return assertUnreachable(
                    config,
                    'Unknown ai scheduler config type',
                );
        }
    }

    private async generateAgentReport(
        user: SessionUser,
        schedulerUuid: string,
        config: AiSchedulerAgentConfigInternal,
        scheduler: SchedulerAndTargets,
    ): Promise<string | null> {
        const context: AiPromptContextInput = [];
        if (scheduler.savedChartUuid) {
            context.push({
                type: 'chart',
                chartUuid: scheduler.savedChartUuid,
            });
        }
        if (scheduler.dashboardUuid) {
            context.push({
                type: 'dashboard',
                dashboardUuid: scheduler.dashboardUuid,
            });
        }
        if (config.includeSourceThread && config.sourceThreadUuid) {
            context.push({
                type: 'thread',
                threadUuid: config.sourceThreadUuid,
            });
        }

        const threadUuid = await this.resolveReportThread(
            user,
            schedulerUuid,
            config,
            context.length ? context : undefined,
        );
        if (!threadUuid) {
            return null;
        }

        return this.aiAgentService.generateAgentThreadResponse(user, {
            agentUuid: config.agentUuid,
            threadUuid,
        });
    }

    // Agentless: a fast model writes the message from the prompt alone.
    private async generateResourceReport(
        config: AiSchedulerResourceConfig,
        scheduler: SchedulerAndTargets,
    ): Promise<string | null> {
        const modelOptions = getModel(this.lightdashConfig.ai.copilot, {
            enableReasoning: false,
            useFastModel: true,
        });
        const resource = scheduler.dashboardUuid
            ? `dashboard "${scheduler.name}"`
            : `chart "${scheduler.name}"`;
        return generateScheduledResourceReport(modelOptions, {
            prompt: config.prompt,
            resource,
        });
    }

    // The thread the agent runs this report in. With run history enabled, runs
    // share one thread so the agent sees prior deliveries; otherwise each run is
    // a fresh thread. A remembered thread that's gone or now belongs to another
    // agent self-heals by starting a new one.
    private async resolveReportThread(
        user: SessionUser,
        schedulerUuid: string,
        config: AiSchedulerAgentConfigInternal,
        context: AiPromptContextInput | undefined,
    ): Promise<string | null> {
        const body = { prompt: config.prompt, context };

        if (config.includeRunHistory && config.reportThreadUuid) {
            try {
                await this.aiAgentService.createAgentThreadMessage(
                    user,
                    config.agentUuid,
                    config.reportThreadUuid,
                    body,
                );
                return config.reportThreadUuid;
            } catch (e) {
                this.logger.warn(
                    `Could not continue report thread ${config.reportThreadUuid} for scheduler ${schedulerUuid}, starting a new one: ${getErrorMessage(
                        e,
                    )}`,
                );
            }
        }

        const thread = await this.aiAgentService.createAgentThread(
            user,
            config.agentUuid,
            body,
        );
        if (!thread) {
            return null;
        }
        if (config.includeRunHistory) {
            await this.aiSchedulerModel.setReportThread(
                schedulerUuid,
                thread.uuid,
            );
        }
        return thread.uuid;
    }
}
