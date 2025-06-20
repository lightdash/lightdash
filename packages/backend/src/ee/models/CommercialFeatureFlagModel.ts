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
            [CommercialFeatureFlags.AiAgent]: this.getAiAgentFlag.bind(this),
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
        let enabled = false;

        if (
            this.lightdashConfig.ai.copilot.enabled &&
            this.lightdashConfig.ai.copilot.requiresFeatureFlag
        ) {
            if (!user) {
                throw new Error(
                    'User is required to check if AI copilot is enabled',
                );
            }

            enabled = await isFeatureFlagEnabled(
                CommercialFeatureFlags.AiCopilot as AnyType as FeatureFlags,
                {
                    userUuid: user.userUuid,
                    organizationUuid: user.organizationUuid,
                    organizationName: user.organizationName,
                },
            );
        } else {
            enabled = this.lightdashConfig.ai.copilot.enabled;
        }

        return {
            id: featureFlagId,
            enabled,
        };
    }

    private async getAiAgentFlag({
        featureFlagId,
        user,
    }: FeatureFlagLogicArgs) {
        if (!user) {
            throw new Error('User is required to check if AI agent is enabled');
        }

        if (!this.lightdashConfig.ai.copilot.enabled) {
            return {
                id: featureFlagId,
                enabled: false,
            };
        }

        return {
            id: featureFlagId,
            enabled: await isFeatureFlagEnabled(
                CommercialFeatureFlags.AiAgent as AnyType as FeatureFlags,
                {
                    userUuid: user.userUuid,
                    organizationUuid: user.organizationUuid,
                    organizationName: user.organizationName,
                },
            ),
        };
    }
}
