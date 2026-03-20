export const FeatureFlagsTableName = 'feature_flags';
export const FeatureFlagOverridesTableName = 'feature_flag_overrides';

export type DbFeatureFlag = {
    flag_id: string;
    default_enabled: boolean;
    created_at: Date;
    updated_at: Date;
};

export type DbFeatureFlagOverride = {
    feature_flag_override_id: number;
    flag_id: string;
    user_uuid: string | null;
    organization_uuid: string | null;
    enabled: boolean;
    created_at: Date;
    updated_at: Date;
};
