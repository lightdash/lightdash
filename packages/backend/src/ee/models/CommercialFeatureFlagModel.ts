import {
    CommercialFeatureFlags,
    FeatureFlag,
    FeatureFlags,
} from '@lightdash/common';
import { Knex } from 'knex';
import { LightdashConfig } from '../../config/parseConfig';
import { FeatureFlagsTableName } from '../../database/entities/featureFlags';
import {
    FeatureFlagLogicArgs,
    FeatureFlagModel,
    FeatureFlagQueryOptions,
} from '../../models/FeatureFlagModel/FeatureFlagModel';
import { ExternalConnectionsTableName } from '../database/entities/externalConnections';

export class CommercialFeatureFlagModel extends FeatureFlagModel {
    constructor(args: { database: Knex; lightdashConfig: LightdashConfig }) {
        super(args);
        this.featureFlagHandlers = {
            ...this.featureFlagHandlers, // Inherit parent handlers
            // Add new commercial handlers
            [CommercialFeatureFlags.AiCopilot]:
                this.getAiCopilotFlag.bind(this),
            [FeatureFlags.ApiQuerySources]:
                this.getApiQuerySourcesEnabled.bind(this),
        };
    }

    // On for orgs on the new onboarding or with a live source already, unless an override says otherwise
    private async getApiQuerySourcesEnabled(
        args: FeatureFlagLogicArgs,
        options: FeatureFlagQueryOptions = {},
    ): Promise<FeatureFlag> {
        const override = await this.tryGetOverrideFromDatabase(args, options);
        if (override) return override;
        const db = options.trx ?? this.database;
        const organizationUuid = args.user?.organizationUuid;
        if (organizationUuid) {
            const newOnboarding = await this.get(
                {
                    featureFlagId: FeatureFlags.NewOnboarding,
                    user: { organizationUuid },
                },
                { ...options, recordCheck: false },
            );
            if (newOnboarding.enabled) {
                return { id: args.featureFlagId, enabled: true };
            }
            const liveSource = await db(ExternalConnectionsTableName)
                .where('organization_uuid', organizationUuid)
                .where('connection_kind', 'live_source')
                .whereNull('deleted_at')
                .first('external_connection_uuid')
                .catch(() => undefined);
            if (liveSource) return { id: args.featureFlagId, enabled: true };
        }
        const flag = await db(FeatureFlagsTableName)
            .where('flag_id', args.featureFlagId)
            .first()
            .catch(() => undefined);
        return {
            id: args.featureFlagId,
            enabled: flag?.default_enabled ?? false,
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

        // The endpoint allows anonymous callers, so fail closed like the
        // other commercial flags instead of erroring.
        if (!user) {
            return { id: featureFlagId, enabled: false };
        }

        const dbResult = await this.tryGetFromDatabase({ user, featureFlagId });
        return dbResult ?? { id: featureFlagId, enabled: false };
    }
}
