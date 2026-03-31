import { Knex } from 'knex';

export const FeatureFlagsTableName = 'feature_flags';
export const FeatureFlagOverridesTableName = 'feature_flag_overrides';

export type DbFeatureFlag = {
    flag_id: string;
    default_enabled: boolean;
    created_at: Date;
    updated_at: Date;
};

export type FeatureFlagsTable = Knex.CompositeTableType<
    DbFeatureFlag,
    Pick<DbFeatureFlag, 'flag_id'> &
        Partial<Pick<DbFeatureFlag, 'default_enabled'>>,
    Pick<DbFeatureFlag, 'default_enabled'>
>;

export type DbFeatureFlagOverride = {
    feature_flag_override_id: number;
    flag_id: string;
    user_uuid: string | null;
    organization_uuid: string | null;
    enabled: boolean;
    created_at: Date;
    updated_at: Date;
};

export type FeatureFlagOverridesTable = Knex.CompositeTableType<
    DbFeatureFlagOverride,
    Pick<DbFeatureFlagOverride, 'flag_id' | 'enabled'> &
        Partial<Pick<DbFeatureFlagOverride, 'user_uuid' | 'organization_uuid'>>,
    Pick<DbFeatureFlagOverride, 'enabled'>
>;
