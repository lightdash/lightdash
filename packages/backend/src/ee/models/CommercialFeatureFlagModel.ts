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
            [CommercialFeatureFlags.HomepageBuilder]:
                this.getHomepageBuilderFlag.bind(this),
            // Infra (licence + storage) decides whether pre-aggregates can run
            // at all; an override can only switch an organization off.
            [CommercialFeatureFlags.PreAggregates]: (flagArgs, options) =>
                this.lightdashConfig.preAggregates.enabled
                    ? this.getWithEnvFallback(flagArgs, true, options)
                    : Promise.resolve({
                          id: flagArgs.featureFlagId,
                          enabled: false,
                      }),
        };
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
}
