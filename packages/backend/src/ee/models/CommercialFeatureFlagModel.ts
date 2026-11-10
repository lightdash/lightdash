import {
    CommercialFeatureFlags,
    FeatureFlag,
    FeatureFlags,
} from '@lightdash/common';
import { Knex } from 'knex';
import { isAppRuntimeConfigured } from '../../config/appRuntimeAvailability';
import { LightdashConfig } from '../../config/parseConfig';
import { FeatureFlagsTableName } from '../../database/entities/featureFlags';
import { OrganizationTableName } from '../../database/entities/organizations';
import {
    FeatureFlagLogicArgs,
    FeatureFlagModel,
    FeatureFlagQueryOptions,
} from '../../models/FeatureFlagModel/FeatureFlagModel';
import { getDuckdbRuntimeConfig } from '../../utils/duckdb/getDuckdbRuntimeConfig';
import { ExternalConnectionsTableName } from '../database/entities/externalConnections';
import { isPreAggregatesEnabled } from '../preAggregates/isPreAggregatesEnabled';
import { isCreatedInAiTrial } from '../services/ai/aiTrial';

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
            [FeatureFlags.EnableDataApps]: this.getDataAppsEnabled.bind(this),
            [FeatureFlags.ExternalSources]:
                this.getExternalSourcesEnabled.bind(this),
        };
    }

    // External sources run on the pre-aggregates DuckDB engine, so they're on
    // for every org wherever that engine is: pre-aggregates enabled and their
    // S3 storage configured. Overrides and the flag default are ignored.
    private async getExternalSourcesEnabled({
        featureFlagId,
    }: FeatureFlagLogicArgs): Promise<FeatureFlag> {
        const enabled =
            isPreAggregatesEnabled(this.lightdashConfig) &&
            getDuckdbRuntimeConfig(this.lightdashConfig.preAggregates.s3) !==
                undefined;
        return { id: featureFlagId, enabled };
    }

    // Data apps follow AI and the sandbox runtime, not a per-org rollout:
    // on for any org with AI (the AI copilot flag or an AI trial) on an
    // instance that can build apps. Overrides and the flag default are ignored.
    private async getDataAppsEnabled(
        args: FeatureFlagLogicArgs,
        options: FeatureFlagQueryOptions = {},
    ): Promise<FeatureFlag> {
        const enabled =
            isAppRuntimeConfigured(this.lightdashConfig) &&
            (await this.isAiAvailable(args, options));
        return { id: args.featureFlagId, enabled };
    }

    // Same rule as AiAgentService.getIsCopilotEnabled: the AI copilot flag,
    // or an organization created inside the AI trial window.
    private async isAiAvailable(
        args: FeatureFlagLogicArgs,
        options: FeatureFlagQueryOptions,
    ): Promise<boolean> {
        const copilot = await this.get(
            {
                featureFlagId: CommercialFeatureFlags.AiCopilot,
                user: args.user,
            },
            { ...options, recordCheck: false },
        );
        if (copilot.enabled) return true;
        const organizationUuid = args.user?.organizationUuid;
        if (!organizationUuid || !this.lightdashConfig.ai.copilot.enabled) {
            return false;
        }
        const db = options.trx ?? this.database;
        const organization = await db(OrganizationTableName)
            .where('organization_uuid', organizationUuid)
            .first('created_at')
            .catch(() => undefined);
        return (
            !!organization?.created_at &&
            isCreatedInAiTrial(new Date(organization.created_at))
        );
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
