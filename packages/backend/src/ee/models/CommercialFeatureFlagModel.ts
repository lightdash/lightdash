import { CommercialFeatureFlags } from '@lightdash/common';
import { Knex } from 'knex';
import { LightdashConfig } from '../../config/parseConfig';
import {
    FeatureFlagLogicArgs,
    FeatureFlagModel,
} from '../../models/FeatureFlagModel/FeatureFlagModel';

export class CommercialFeatureFlagModel extends FeatureFlagModel {
    constructor(args: { database: Knex; lightdashConfig: LightdashConfig }) {
        super(args);
        this.featureFlagHandlers = {
            ...this.featureFlagHandlers, // Inherit parent handlers
            // Add new commercial handlers
            [CommercialFeatureFlags.AiCopilot]:
                this.getAiCopilotFlag.bind(this),
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
