import {
    AiAgentSummary,
    CommercialFeatureFlags,
    ForbiddenError,
    LightdashUser,
    type SessionUser,
} from '@lightdash/common';
import { FeatureFlagService } from '../../services/FeatureFlag/FeatureFlagService';
import { AiAgentModel } from '../models/AiAgentModel';
import type { CommercialSlackAuthenticationModel } from '../models/CommercialSlackAuthenticationModel';

type AiAgentServiceDependencies = {
    aiAgentModel: AiAgentModel;
    slackAuthenticationModel: CommercialSlackAuthenticationModel;
    featureFlagService: FeatureFlagService;
};

export class AiAgentService {
    private readonly aiAgentModel: AiAgentModel;

    private readonly slackAuthenticationModel: CommercialSlackAuthenticationModel;

    private readonly featureFlagService: FeatureFlagService;

    constructor(dependencies: AiAgentServiceDependencies) {
        this.aiAgentModel = dependencies.aiAgentModel;
        this.slackAuthenticationModel = dependencies.slackAuthenticationModel;
        this.featureFlagService = dependencies.featureFlagService;
    }

    private async getIsCopilotEnabled(
        user: Pick<LightdashUser, 'userUuid' | 'organizationUuid'>,
    ) {
        const aiCopilotFlag = await this.featureFlagService.get({
            user,
            featureFlagId: CommercialFeatureFlags.AiCopilot,
        });
        return aiCopilotFlag.enabled;
    }

    public async getAgent(user: SessionUser, agentUuid: string) {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }

        const isCopilotEnabled = await this.getIsCopilotEnabled(user);
        if (!isCopilotEnabled) {
            throw new ForbiddenError('Copilot is not enabled');
        }

        // TODO:
        // permissions

        const agent = await this.aiAgentModel.getAgent({
            organizationUuid,
            agentUuid,
        });

        return agent;
    }

    public async listAgents(user: SessionUser) {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }

        const isCopilotEnabled = await this.getIsCopilotEnabled(user);
        if (!isCopilotEnabled) {
            throw new ForbiddenError('Copilot is not enabled');
        }

        // TODO:
        // permissions

        const agents = await this.aiAgentModel.findAllAgents({
            organizationUuid,
        });

        return agents;
    }
}
