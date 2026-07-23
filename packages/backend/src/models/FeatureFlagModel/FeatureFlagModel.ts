import {
    CommercialFeatureFlags,
    FeatureFlag,
    FeatureFlags,
    LightdashUser,
} from '@lightdash/common';
import { Knex } from 'knex';
import { LightdashConfig } from '../../config/parseConfig';
import {
    FeatureFlagOverridesTableName,
    FeatureFlagsTableName,
} from '../../database/entities/featureFlags';
import Logger from '../../logging/logger';

const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FeatureFlagLogicArgs = {
    user?: Pick<LightdashUser, 'userUuid' | 'organizationUuid'>;
    featureFlagId: string;
};

type FeatureFlagQueryOptions = { trx?: Knex };

export class FeatureFlagModel {
    protected readonly database: Knex;

    protected readonly lightdashConfig: LightdashConfig;

    protected featureFlagHandlers: Record<
        string,
        (
            args: FeatureFlagLogicArgs,
            options?: FeatureFlagQueryOptions,
        ) => Promise<FeatureFlag>
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
            [FeatureFlags.ResultsCacheEnabled]: (flagArgs, options) =>
                this.getWithEnvFallback(
                    flagArgs,
                    this.lightdashConfig.results.cacheEnabled,
                    options,
                ),
        };
    }

    public async get(
        args: FeatureFlagLogicArgs,
        options: FeatureFlagQueryOptions = {},
    ): Promise<FeatureFlag> {
        // 1a. Check env var enable-allowlist (self-hosted escape hatch)
        if (this.lightdashConfig.enabledFeatureFlags.has(args.featureFlagId)) {
            if (
                Object.values(CommercialFeatureFlags).includes(
                    args.featureFlagId as CommercialFeatureFlags,
                ) && !this.canEnableCommercialFeatureFlagsFromEnv()
            ) {
                Logger.warn(
                    `Ignoring commercial feature flag ${args.featureFlagId} in LIGHTDASH_ENABLE_FEATURE_FLAGS without commercial feature flag handling`,
                );
                return { id: args.featureFlagId, enabled: false };
            }
            return { id: args.featureFlagId, enabled: true };
        }

        // 1b. Check env var disable-allowlist (self-hosted kill switch)
        if (this.lightdashConfig.disabledFeatureFlags.has(args.featureFlagId)) {
            return { id: args.featureFlagId, enabled: false };
        }

        // 2. Check per-flag config handlers
        const handler = this.featureFlagHandlers[args.featureFlagId];
        if (handler) {
            return handler(args, options);
        }

        // 3. Check database (user override > org override > flag default)
        const dbResult = await this.tryGetFromDatabase(args, options);
        if (dbResult !== null) {
            return dbResult;
        }

        // Unknown flags default to disabled.
        // See: GLITCH-331
        return { id: args.featureFlagId, enabled: false };
    }

    protected canEnableCommercialFeatureFlagsFromEnv(): boolean {
        return false;
    }

    private async getEditYamlInUiEnabled({
        featureFlagId,
    }: FeatureFlagLogicArgs) {
        return {
            id: featureFlagId,
            enabled: this.lightdashConfig.editYamlInUi.enabled,
        };
    }

    private async getEnableTimezoneSupportEnabled(
        args: FeatureFlagLogicArgs,
        options: FeatureFlagQueryOptions = {},
    ): Promise<FeatureFlag> {
        if (this.lightdashConfig.query.enableTimezoneSupport) {
            return { id: args.featureFlagId, enabled: true };
        }
        const dbResult = await this.tryGetFromDatabase(args, options);
        return dbResult ?? { id: args.featureFlagId, enabled: false };
    }

    private async getEnableDataAppsEnabled(
        args: FeatureFlagLogicArgs,
        options: FeatureFlagQueryOptions = {},
    ): Promise<FeatureFlag> {
        if (this.lightdashConfig.appRuntime.enabled) {
            return { id: args.featureFlagId, enabled: true };
        }
        const dbResult = await this.tryGetFromDatabase(args, options);
        return dbResult ?? { id: args.featureFlagId, enabled: false };
    }

    // DB value (user override → org override → flag default) wins. Falls
    // back to the env-derived value when the flag has no DB row and no
    // override applies.
    private async getWithEnvFallback(
        args: FeatureFlagLogicArgs,
        envFallback: boolean,
        options: FeatureFlagQueryOptions = {},
    ): Promise<FeatureFlag> {
        const dbResult = await this.tryGetFromDatabase(args, options);
        return dbResult ?? { id: args.featureFlagId, enabled: envFallback };
    }

    protected async tryGetFromDatabase(
        args: FeatureFlagLogicArgs,
        { trx = this.database }: FeatureFlagQueryOptions = {},
    ): Promise<FeatureFlag | null> {
        try {
            return await FeatureFlagModel.getFromDatabase(args, trx);
        } catch (e) {
            Logger.warn(
                `Failed to check feature flag ${args.featureFlagId} from database, falling through: ${e}`,
            );
            return null;
        }
    }

    private static async getFromDatabase(
        args: FeatureFlagLogicArgs,
        trx: Knex,
    ): Promise<FeatureFlag | null> {
        const flag = await trx(FeatureFlagsTableName)
            .where('flag_id', args.featureFlagId)
            .first();

        if (!flag) {
            return null;
        }

        // Priority: user override > org override > flag default
        // Skip the user-override lookup unless the userUuid is a real UUID.
        // Anonymous (embed/JWT) accounts use a non-UUID externalId for
        // `user.userUuid`; passing it to a `uuid` column raises a Postgres
        // type error and would prevent the org-override lookup below.
        if (args.user?.userUuid && UUID_REGEX.test(args.user.userUuid)) {
            const userOverride = await trx(FeatureFlagOverridesTableName)
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
            const orgOverride = await trx(FeatureFlagOverridesTableName)
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
