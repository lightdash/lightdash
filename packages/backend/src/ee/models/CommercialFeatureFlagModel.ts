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
                          organizationName: user.organizationName,
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

    private async getAiCopilotFlag({
        featureFlagId,
        user,
    }: FeatureFlagLogicArgs) {
        const { enabled: copilotConfigEnabled, requiresFeatureFlag } =
            this.lightdashConfig.ai.copilot;

        // Dedicated instances (per the AI Copilot tenant docs) bypass the
        // flag system entirely. Shared tenants (app/eu1) set
        // requiresFeatureFlag=true and gate per-org via DB-backed overrides.
        if (!copilotConfigEnabled || !requiresFeatureFlag) {
            return { id: featureFlagId, enabled: copilotConfigEnabled };
        }

        if (!user) {
            throw new Error(
                'User is required to check if AI copilot is enabled',
            );
        }

        const dbResult = await this.tryGetFromDatabase({ user, featureFlagId });
        return dbResult ?? { id: featureFlagId, enabled: false };
    }
}
