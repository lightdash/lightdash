import { subject } from '@casl/ability';
import {
    ForbiddenError,
    type AiPromptContextInput,
    type AiSchedulerConfig,
    type SessionUser,
    type UpsertAiSchedulerConfig,
} from '@lightdash/common';
import { SchedulerModel } from '../../models/SchedulerModel';
import { UserModel } from '../../models/UserModel';
import { BaseService } from '../../services/BaseService';
import { SchedulerService } from '../../services/SchedulerService/SchedulerService';
import { AiSchedulerModel } from '../models/AiSchedulerModel';
import { AiAgentService } from './AiAgentService/AiAgentService';

type Dependencies = {
    aiSchedulerModel: AiSchedulerModel;
    schedulerModel: SchedulerModel;
    userModel: UserModel;
    schedulerService: SchedulerService;
    aiAgentService: AiAgentService;
};

// Joins a (read-only) OSS scheduler with its EE ai_scheduler config and runs
// the agent. The OSS scheduler layer stays AI-free.
export class AiSchedulerService extends BaseService {
    private readonly aiSchedulerModel: AiSchedulerModel;

    private readonly schedulerModel: SchedulerModel;

    private readonly userModel: UserModel;

    private readonly schedulerService: SchedulerService;

    private readonly aiAgentService: AiAgentService;

    constructor(deps: Dependencies) {
        super({ serviceName: 'AiSchedulerService' });
        this.aiSchedulerModel = deps.aiSchedulerModel;
        this.schedulerModel = deps.schedulerModel;
        this.userModel = deps.userModel;
        this.schedulerService = deps.schedulerService;
        this.aiAgentService = deps.aiAgentService;
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
        return this.aiSchedulerModel.find(schedulerUuid);
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
        // Throws ForbiddenError if the user can't access the agent.
        await this.aiAgentService.getAgent(user, config.agentUuid, projectUuid);
        await this.aiSchedulerModel.upsert(schedulerUuid, config);
    }

    async removeConfig(
        user: SessionUser,
        schedulerUuid: string,
    ): Promise<void> {
        await this.assertCanManageScheduler(user, schedulerUuid);
        await this.aiSchedulerModel.remove(schedulerUuid);
    }

    // The agent's report for a delivery, or null when it has no AI config.
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

        const thread = await this.aiAgentService.createAgentThread(
            user,
            config.agentUuid,
            {
                prompt: config.prompt,
                context: context.length ? context : undefined,
            },
        );
        if (!thread) {
            return null;
        }

        return this.aiAgentService.generateAgentThreadResponse(user, {
            agentUuid: config.agentUuid,
            threadUuid: thread.uuid,
        });
    }
}
