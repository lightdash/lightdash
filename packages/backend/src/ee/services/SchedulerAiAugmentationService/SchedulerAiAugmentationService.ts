import {
    assertUnreachable,
    ForbiddenError,
    SchedulerAiAugmentation,
    SchedulerAiAugmentationType,
    SessionUser,
} from '@lightdash/common';
import { SchedulerModel } from '../../../models/SchedulerModel';
import { UserModel } from '../../../models/UserModel';
import { SchedulerAiAugmentationModel } from '../../models/SchedulerAiAugmentationModel';
import type { AiAgentService } from '../AiAgentService/AiAgentService';
import type { AiService } from '../AiService/AiService';

type Dependencies = {
    schedulerAiAugmentationModel: SchedulerAiAugmentationModel;
    schedulerModel: SchedulerModel;
    userModel: UserModel;
    aiAgentService: AiAgentService;
    aiService: AiService;
};

export class SchedulerAiAugmentationService {
    private readonly schedulerAiAugmentationModel: SchedulerAiAugmentationModel;

    private readonly schedulerModel: SchedulerModel;

    private readonly userModel: UserModel;

    private readonly aiAgentService: AiAgentService;

    private readonly aiService: AiService;

    constructor(dependencies: Dependencies) {
        this.schedulerAiAugmentationModel =
            dependencies.schedulerAiAugmentationModel;
        this.schedulerModel = dependencies.schedulerModel;
        this.userModel = dependencies.userModel;
        this.aiAgentService = dependencies.aiAgentService;
        this.aiService = dependencies.aiService;
    }

    async getAugmentation(
        schedulerUuid: string,
    ): Promise<SchedulerAiAugmentation | null> {
        return this.schedulerAiAugmentationModel.find(schedulerUuid);
    }

    // Validates that the caller can use the chosen agent before persisting.
    // getAgent throws NotFoundError/ForbiddenError when the agent is missing or
    // inaccessible, so a bogus or cross-org agent is rejected at write time
    // rather than failing on every scheduled fire.
    async upsertAugmentation(
        user: SessionUser,
        schedulerUuid: string,
        augmentation: SchedulerAiAugmentation,
    ): Promise<SchedulerAiAugmentation> {
        if (augmentation.type === SchedulerAiAugmentationType.AGENT) {
            await this.aiAgentService.getAgent(user, augmentation.agentUuid);
        }
        await this.schedulerAiAugmentationModel.upsert(
            schedulerUuid,
            augmentation,
        );
        return augmentation;
    }

    async deleteAugmentation(schedulerUuid: string): Promise<void> {
        await this.schedulerAiAugmentationModel.delete(schedulerUuid);
    }

    /**
     * Runs the augmentation for a firing delivery and returns the message, or
     * null when the scheduler has no augmentation. Executes as the delivery's
     * creator so their permissions apply. `content` is the delivery's rendered
     * data (filters and parameters already applied); the fast model summarises
     * it directly, while the agent re-queries via its own tools.
     */
    async runForDelivery({
        schedulerUuid,
        organizationUuid,
        createdBy,
        content,
    }: {
        schedulerUuid: string;
        organizationUuid: string;
        createdBy: string;
        content: string;
    }): Promise<string | null> {
        const augmentation =
            await this.schedulerAiAugmentationModel.find(schedulerUuid);
        if (!augmentation) return null;

        const creator = await this.userModel.findSessionUserAndOrgByUuid(
            createdBy,
            organizationUuid,
        );
        const scheduler =
            await this.schedulerModel.getSchedulerAndTargets(schedulerUuid);

        switch (augmentation.type) {
            case SchedulerAiAugmentationType.AGENT:
                return this.aiAgentService.generateScheduledReport(creator, {
                    agentUuid: augmentation.agentUuid,
                    prompt: augmentation.prompt,
                    savedChartUuid: scheduler.savedChartUuid,
                    dashboardUuid: scheduler.dashboardUuid,
                    sourceThreadUuid: augmentation.sourceThreadUuid,
                });
            case SchedulerAiAugmentationType.FAST_MODEL:
                if (!scheduler.projectUuid) {
                    throw new ForbiddenError(
                        'Scheduler is not attached to a project',
                    );
                }
                return this.aiService.generateDeliverySummary(creator, {
                    prompt: augmentation.prompt,
                    content,
                    projectUuid: scheduler.projectUuid,
                });
            default:
                return assertUnreachable(
                    augmentation,
                    'Unknown scheduler AI augmentation type',
                );
        }
    }
}
