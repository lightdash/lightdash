import {
    AnyType,
    CommercialFeatureFlags,
    FeatureFlags,
} from '@lightdash/common';
import { Knex } from 'knex';
import { LightdashConfig } from '../../config/parseConfig';
import {
    FeatureFlagLogicArgs,
    FeatureFlagModel,
} from '../../models/FeatureFlagModel/FeatureFlagModel';
import { isFeatureFlagEnabled } from '../../postHog';

export class CommercialFeatureFlagModel extends FeatureFlagModel {
    constructor(args: { database: Knex; lightdashConfig: LightdashConfig }) {
        super(args);
        this.featureFlagHandlers = {
            ...this.featureFlagHandlers, // Inherit parent handlers
            // Add new commercial handlers
            [CommercialFeatureFlags.Embedding]:
                this.getEmbeddingFlag.bind(this),
            [CommercialFeatureFlags.Scim]: this.getScimFlag.bind(this),
            [CommercialFeatureFlags.AiCopilot]:
                this.getAiCopilotFlag.bind(this),
        };
    }

    private async getEmbeddingFlag({
        user,
        featureFlagId,
    }: FeatureFlagLogicArgs) {
        const enabled =
            this.lightdashConfig.embedding.enabled ||
            (user
                ? await isFeatureFlagEnabled(
                      CommercialFeatureFlags.Embedding as AnyType as FeatureFlags,
                      {
                          userUuid: user.userUuid,
                          organizationUuid: user.organizationUuid,
                      },
                      {
                          throwOnTimeout: false,
                      },
                  )
                : false);
        return {
            id: featureFlagId,
            enabled,
        };
    }

    private async getScimFlag({ user, featureFlagId }: FeatureFlagLogicArgs) {
        const enabled =
            this.lightdashConfig.scim.enabled ||
            (user
                ? await isFeatureFlagEnabled(
                      CommercialFeatureFlags.Scim as AnyType as FeatureFlags,
                      {
                          userUuid: user.userUuid,
                          organizationUuid: user.organizationUuid,
                      },
                      {
                          throwOnTimeout: false,
                      },
                  )
                : false);
        return {
            id: featureFlagId,
            enabled,
        };
    }

    private async getAiCopilotFlag({ featureFlagId }: FeatureFlagLogicArgs) {
        return {
            id: featureFlagId,
            enabled: this.lightdashConfig.ai.copilot.enabled,
        };
    }
}
