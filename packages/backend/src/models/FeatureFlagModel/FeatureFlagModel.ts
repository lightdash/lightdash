import {
    FeatureFlag,
    FeatureFlags,
    LightdashUser,
    PREVIEW_ENABLED_FEATURE_FLAGS,
} from '@lightdash/common';
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

// Matches the feature_flag_overrides_org_idx partial unique index.
const ORG_OVERRIDE_CONFLICT_TARGET =
    '(flag_id, organization_uuid) WHERE organization_uuid IS NOT NULL AND user_uuid IS NULL';

export type FeatureFlagLogicArgs = {
    user?: Pick<LightdashUser, 'userUuid' | 'organizationUuid'>;
    featureFlagId: string;
};

export type EnsureOrganizationOverrideOutcome =
    | 'enabled'
    | 'already_enabled'
    | 'kept_disabled';

type FeatureFlagQueryOptions = {
    trx?: Knex;
    /** Set false for admin listings so they don't inflate flag-usage telemetry. */
    recordCheck?: boolean;
};

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
        const result = await this.resolve(args, options);

        if (options.recordCheck !== false) {
            try {
                record(
                    args.featureFlagId,
                    args.user?.organizationUuid ?? null,
                    result.enabled,
                );
            } catch {
                return result;
            }
        }

        return result;
    }

    private async resolve(
        args: FeatureFlagLogicArgs,
        options: FeatureFlagQueryOptions,
    ): Promise<FeatureFlag> {
        // 1a. Env var enable-allowlist (self-hosted escape hatch) still wins
        // over the disable-allowlist when a flag is in both.
        const envEnabled = this.lightdashConfig.enabledFeatureFlags.has(
            args.featureFlagId,
        );

        // 1b. Env var disable-allowlist is an absolute kill switch: not even a
        // stored override may resurrect the flag.
        if (
            !envEnabled &&
            this.lightdashConfig.disabledFeatureFlags.has(args.featureFlagId)
        ) {
            return { id: args.featureFlagId, enabled: false };
        }

        // 2. Instance-wide enablement: the enable-allowlist and, in preview
        // environments, the curated default set.
        const forcedOn =
            envEnabled ||
            (this.lightdashConfig.previewFeatureFlags.enabled &&
                PREVIEW_ENABLED_FEATURE_FLAGS.has(args.featureFlagId));
        if (forcedOn) {
            // Preview environments let a stored override win over the forced
            // value so QA can toggle flags without a redeploy.
            if (this.lightdashConfig.previewFeatureFlags.enabled) {
                const override = await this.tryGetOverrideFromDatabase(
                    args,
                    options,
                );
                if (override) {
                    return override;
                }
            }
            return { id: args.featureFlagId, enabled: true };
        }

        // 3. Check per-flag config handlers
        const handler = this.featureFlagHandlers[args.featureFlagId];
        if (handler) {
            return handler(args, options);
        }

        // 4. Check database (user override > org override > flag default)
        const dbResult = await this.tryGetFromDatabase(args, options);
        return dbResult ?? { id: args.featureFlagId, enabled: false };
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

    private static organizationOverrideQuery(
        trx: Knex,
        featureFlagId: string,
        organizationUuid: string,
    ) {
        return trx(FeatureFlagOverridesTableName)
            .where('flag_id', featureFlagId)
            .where('organization_uuid', organizationUuid)
            .whereNull('user_uuid');
    }

    // `default_enabled: null` means "no opinion", so a flag row created purely
    // to hang an override off never disables the flag once the override is gone.
    private static ensureFlagRow(trx: Knex, featureFlagId: string) {
        return trx(FeatureFlagsTableName)
            .insert({ flag_id: featureFlagId, default_enabled: null })
            .onConflict('flag_id')
            .ignore();
    }

    // Insert-only enablement: an existing override row (including an explicit
    // enabled=false) is never modified.
    public async ensureOrganizationOverrideEnabled(
        featureFlagId: string,
        organizationUuid: string,
    ): Promise<EnsureOrganizationOverrideOutcome> {
        const getOrganizationOverride = () =>
            FeatureFlagModel.organizationOverrideQuery(
                this.database,
                featureFlagId,
                organizationUuid,
            ).first();

        const existing = await getOrganizationOverride();
        if (existing) {
            return existing.enabled ? 'already_enabled' : 'kept_disabled';
        }

        await FeatureFlagModel.ensureFlagRow(this.database, featureFlagId);

        const inserted = await this.database(FeatureFlagOverridesTableName)
            .insert({
                flag_id: featureFlagId,
                organization_uuid: organizationUuid,
                enabled: true,
            })
            .onConflict(this.database.raw(ORG_OVERRIDE_CONFLICT_TARGET))
            .ignore()
            .returning('feature_flag_override_id');
        if (inserted.length > 0) {
            return 'enabled';
        }
        const concurrent = await getOrganizationOverride();
        return concurrent?.enabled === false
            ? 'kept_disabled'
            : 'already_enabled';
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
        const override = await FeatureFlagModel.getOverrideFromDatabase(
            args,
            trx,
        );
        if (override) {
            return override;
        }

        if (flag.default_enabled === null) {
            return null;
        }

        return { id: args.featureFlagId, enabled: flag.default_enabled };
    }

    protected async tryGetOverrideFromDatabase(
        args: FeatureFlagLogicArgs,
        { trx = this.database }: FeatureFlagQueryOptions = {},
    ): Promise<FeatureFlag | null> {
        try {
            return await FeatureFlagModel.getOverrideFromDatabase(args, trx);
        } catch (e) {
            Logger.warn(
                `Failed to check feature flag override ${args.featureFlagId} from database, falling through: ${e}`,
            );
            return null;
        }
    }

    // User override > org override. Returns null when neither exists.
    private static async getOverrideFromDatabase(
        args: FeatureFlagLogicArgs,
        trx: Knex,
    ): Promise<FeatureFlag | null> {
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

        return null;
    }

    // Upserts the organization-level override, creating the parent flag row
    // when it doesn't exist yet.
    public async upsertOrganizationOverride(
        featureFlagId: string,
        organizationUuid: string,
        enabled: boolean,
    ): Promise<void> {
        await this.database.transaction(async (trx) => {
            await FeatureFlagModel.ensureFlagRow(trx, featureFlagId);

            await trx(FeatureFlagOverridesTableName)
                .insert({
                    flag_id: featureFlagId,
                    organization_uuid: organizationUuid,
                    enabled,
                })
                .onConflict(trx.raw(ORG_OVERRIDE_CONFLICT_TARGET))
                .merge({ enabled, updated_at: new Date() });
        });
    }

    public async deleteOrganizationOverride(
        featureFlagId: string,
        organizationUuid: string,
    ): Promise<void> {
        await FeatureFlagModel.organizationOverrideQuery(
            this.database,
            featureFlagId,
            organizationUuid,
        ).delete();
    }
}
