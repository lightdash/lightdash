import {
    type AiAgent,
    CommercialFeatureFlags,
    ForbiddenError,
    LightdashUser,
    NotFoundError,
    type SessionUser,
} from '@lightdash/common';

import { FeatureFlagService } from '../../services/FeatureFlag/FeatureFlagService';
import type { CommercialSlackAuthenticationModel } from '../models/CommercialSlackAuthenticationModel';

type AiAgentServiceDependencies = {
    slackAuthenticationModel: CommercialSlackAuthenticationModel;
    featureFlagService: FeatureFlagService;
};

export class AiAgentService {
    private readonly slackAuthenticationModel: CommercialSlackAuthenticationModel;

    private readonly featureFlagService: FeatureFlagService;

    constructor(dependencies: AiAgentServiceDependencies) {
        this.slackAuthenticationModel = dependencies.slackAuthenticationModel;
        this.featureFlagService = dependencies.featureFlagService;
    }
}
