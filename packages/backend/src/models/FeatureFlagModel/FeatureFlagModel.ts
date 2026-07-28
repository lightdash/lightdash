import { FeatureFlag, FeatureFlags, LightdashUser } from '@lightdash/common';
import { Knex } from 'knex';
import { LightdashConfig } from '../../config/parseConfig';
import {
    FeatureFlagOverridesTableName,
    FeatureFlagsTableName,
} from '../../database/entities/featureFlags';
import Logger from '../../logging/logger';
import { record } from './flagCheckAggregator';

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
        let result: FeatureFlag;

        // 1a. Check env var enable-allowlist (self-hosted escape hatch)
        if (this.lightdashConfig.enabledFeatureFlags.has(args.featureFlagId)) {
            result = { id: args.featureFlagId, enabled: true };
        } else if (
            this.lightdashConfig.disabledFeatureFlags.has(args.featureFlagId)
        ) {
            // 1b. Check env var disable-allowlist (self-hosted kill switch)
            result = { id: args.featureFlagId, enabled: false };
        } else {
            // 2. Check per-flag config handlers
            const handler = this.featureFlagHandlers[args.featureFlagId];
            if (handler) {
                result = await handler(args, options);
            } else {
                // 3. Check database (user override > org override > flag default)
                const dbResult = await this.tryGetFromDatabase(args, options);
                result = dbResult ?? { id: args.featureFlagId, enabled: false };
            }
        }

        try {
            record(
                args.featureFlagId,
                args.user?.organizationUuid ?? null,
                result.enabled,
            );
        } catch {
            return result;
        }

        return result;
    }

    private async getEditYamlInUiEnabled({
        featureFlagId,
    }: FeatureFlagLogicArgs) {
        return {
            id: featureFlagId,
            enabled: this.lightdashConfig.editYamlInUi.enabled,
        };
    }

    // On by default. Disable it instance-wide with
    // LIGHTDASH_ENABLE_TIMEZONE_SUPPORT=false (or LIGHTDASH_DISABLE_FEATURE_FLAGS),
    // or per organization/user with a `feature_flag_overrides` row.
    private async getEnableTimezoneSupportEnabled(
        args: FeatureFlagLogicArgs,
        options: FeatureFlagQueryOptions = {},
    ): Promise<FeatureFlag> {
        if (this.lightdashConfig.query.enableTimezoneSupport !== undefined) {
            return {
                id: args.featureFlagId,
                enabled: this.lightdashConfig.query.enableTimezoneSupport,
            };
        }
        return this.getWithEnvFallback(args, true, options);
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
    // back to the supplied default when the flag has no DB row and no
    // override applies.
    private async getWithEnvFallback(
        args: FeatureFlagLogicArgs,
        fallback: boolean,
        options: FeatureFlagQueryOptions = {},
    ): Promise<FeatureFlag> {
        const dbResult = await this.tryGetFromDatabase(args, options);
        return dbResult ?? { id: args.featureFlagId, enabled: fallback };
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
