import {
    CommercialFeatureFlags,
    FeatureFlag,
    FeatureFlags,
    getAiCreditContractWindow,
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
import { AiCreditContractsTableName } from '../database/entities/aiCredits';
import { ExternalConnectionsTableName } from '../database/entities/externalConnections';
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
        };
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

    // Self-hosted: on for every org when AI_COPILOT_ENABLED=true.
    // Lightdash Cloud: on for orgs with an AI credit contract in force,
    // which Lightdash Console manages. Overrides are ignored.
    private async getAiCopilotFlag(
        { featureFlagId, user }: FeatureFlagLogicArgs,
        options: FeatureFlagQueryOptions = {},
    ): Promise<FeatureFlag> {
        if (!this.lightdashConfig.ai.copilot.enabled) {
            return { id: featureFlagId, enabled: false };
        }
        if (this.lightdashConfig.lightdashCloudInstance === undefined) {
            return { id: featureFlagId, enabled: true };
        }
        // The endpoint allows anonymous callers, so fail closed.
        const organizationUuid = user?.organizationUuid;
        if (!organizationUuid) {
            return { id: featureFlagId, enabled: false };
        }
        const db = options.trx ?? this.database;
        const contract = await db(AiCreditContractsTableName)
            .where('organization_uuid', organizationUuid)
            .first('starts_at', 'ends_at', 'reset_interval_months')
            .catch(() => undefined);
        const enabled =
            !!contract &&
            getAiCreditContractWindow(
                {
                    startsAt: contract.starts_at,
                    endsAt: contract.ends_at,
                    resetIntervalMonths: contract.reset_interval_months,
                },
                new Date(),
            ) !== null;
        return { id: featureFlagId, enabled };
    }
}
