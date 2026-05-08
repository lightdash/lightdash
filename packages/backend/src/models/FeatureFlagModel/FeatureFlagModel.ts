import { FeatureFlag, FeatureFlags, LightdashUser } from '@lightdash/common';
import { Knex } from 'knex';
import { LightdashConfig } from '../../config/parseConfig';
import {
    FeatureFlagOverridesTableName,
    FeatureFlagsTableName,
} from '../../database/entities/featureFlags';
import Logger from '../../logging/logger';

export type FeatureFlagLogicArgs = {
    user?: Pick<
        LightdashUser,
        'userUuid' | 'organizationUuid' | 'organizationName'
    >;
    featureFlagId: string;
};

export class FeatureFlagModel {
    protected readonly database: Knex;

    protected readonly lightdashConfig: LightdashConfig;

    protected featureFlagHandlers: Record<
        string,
        (args: FeatureFlagLogicArgs) => Promise<FeatureFlag>
    >;

    constructor(args: { database: Knex; lightdashConfig: LightdashConfig }) {
        this.database = args.database;
        this.lightdashConfig = args.lightdashConfig;
        // Initialize the handlers for feature flag logic
        this.featureFlagHandlers = {
            [FeatureFlags.EditYamlInUi]: this.getEditYamlInUiEnabled.bind(this),
            [FeatureFlags.EnableTimezoneSupport]:
                this.getEnableTimezoneSupportEnabled.bind(this),
            [FeatureFlags.EnableDataApps]:
                this.getEnableDataAppsEnabled.bind(this),
        };
    }

    public async get(args: FeatureFlagLogicArgs): Promise<FeatureFlag> {
        // 1a. Check env var enable-allowlist (self-hosted escape hatch)
        if (this.lightdashConfig.enabledFeatureFlags.has(args.featureFlagId)) {
            return { id: args.featureFlagId, enabled: true };
        }

        // 1b. Check env var disable-allowlist (self-hosted kill switch)
        if (this.lightdashConfig.disabledFeatureFlags.has(args.featureFlagId)) {
            return { id: args.featureFlagId, enabled: false };
        }

        // 2. Check per-flag config handlers
        const handler = this.featureFlagHandlers[args.featureFlagId];
        if (handler) {
            return handler(args);
        }

        // 3. Check database (user override > org override > flag default)
        const dbResult = await this.tryGetFromDatabase(args);
        if (dbResult !== null) {
            return dbResult;
        }

        // Unknown flags default to disabled.
        // See: GLITCH-331
        return { id: args.featureFlagId, enabled: false };
    }

    private async getEditYamlInUiEnabled({
        featureFlagId,
    }: FeatureFlagLogicArgs) {
        return {
            id: featureFlagId,
            enabled: this.lightdashConfig.editYamlInUi.enabled,
        };
    }

    // No PostHog — checked in the query execution path where adding
    // latency is not acceptable.
    private async getEnableTimezoneSupportEnabled(
        args: FeatureFlagLogicArgs,
    ): Promise<FeatureFlag> {
        if (this.lightdashConfig.query.enableTimezoneSupport) {
            return { id: args.featureFlagId, enabled: true };
        }
        const dbResult = await this.tryGetFromDatabase(args);
        return dbResult ?? { id: args.featureFlagId, enabled: false };
    }

    private async getEnableDataAppsEnabled(
        args: FeatureFlagLogicArgs,
    ): Promise<FeatureFlag> {
        if (this.lightdashConfig.appRuntime.enabled) {
            return { id: args.featureFlagId, enabled: true };
        }
        const dbResult = await this.tryGetFromDatabase(args);
        return dbResult ?? { id: args.featureFlagId, enabled: false };
    }

    protected async tryGetFromDatabase(
        args: FeatureFlagLogicArgs,
    ): Promise<FeatureFlag | null> {
        try {
            return await this.getFromDatabase(args);
        } catch (e) {
            Logger.warn(
                `Failed to check feature flag ${args.featureFlagId} from database, falling through: ${e}`,
            );
            return null;
        }
    }

    private async getFromDatabase(
        args: FeatureFlagLogicArgs,
    ): Promise<FeatureFlag | null> {
        const flag = await this.database(FeatureFlagsTableName)
            .where('flag_id', args.featureFlagId)
            .first();

        if (!flag) {
            return null;
        }

        // Priority: user override > org override > flag default
        if (args.user?.userUuid) {
            const userOverride = await this.database(
                FeatureFlagOverridesTableName,
            )
                .where('flag_id', args.featureFlagId)
                .where('user_uuid', args.user.userUuid)
                .first();
            if (userOverride) {
                return {
                    id: args.featureFlagId,
                    enabled: userOverride.enabled,
                };
            }
        }

        if (args.user?.organizationUuid) {
            const orgOverride = await this.database(
                FeatureFlagOverridesTableName,
            )
                .where('flag_id', args.featureFlagId)
                .where('organization_uuid', args.user.organizationUuid)
                .whereNull('user_uuid')
                .first();
            if (orgOverride) {
                return {
                    id: args.featureFlagId,
                    enabled: orgOverride.enabled,
                };
            }
        }

        if (flag.default_enabled === null) {
            return null;
        }

        return { id: args.featureFlagId, enabled: flag.default_enabled };
    }
}
