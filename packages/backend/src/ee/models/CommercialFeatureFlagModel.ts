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
            [CommercialFeatureFlags.DirectAccess]:
                this.getDirectAccessFlag.bind(this),
            [CommercialFeatureFlags.HomepageBuilder]:
                this.getHomepageBuilderFlag.bind(this),
        };
    }

    // Organization-only: a per-user override can neither enable direct
    // access nor bypass an organization-level disable.
    private async getDirectAccessFlag(args: FeatureFlagLogicArgs) {
        const organizationUuid = args.user?.organizationUuid;
        if (!organizationUuid) {
            return { id: args.featureFlagId, enabled: false };
        }
        const dbResult = await this.tryGetOrganizationScopedFromDatabase(
            args.featureFlagId,
            organizationUuid,
        );
        return dbResult ?? { id: args.featureFlagId, enabled: false };
    }

    // Default-off; enabled per-org via DB-backed overrides.
    private async getHomepageBuilderFlag({
        featureFlagId,
        user,
    }: FeatureFlagLogicArgs) {
        if (!user) {
            return { id: featureFlagId, enabled: false };
        }
        const dbResult = await this.tryGetFromDatabase({ user, featureFlagId });
        return dbResult ?? { id: featureFlagId, enabled: false };
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
