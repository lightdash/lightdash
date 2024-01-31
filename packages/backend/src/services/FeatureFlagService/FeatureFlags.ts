/**
 * Before using a FeatureFlag, include it as a member in this enum,
 * to ensure you can use it with FeatureFlagService. Consider adding
 * a short description of the feature flag and how it will be used.
 *
 * If the feature flag is no longer in use, remove it from this enum.
 */
export enum FeatureFlags {
    /**
     * Use dbt ls when compiling lightdash projects with "refresh dbt"
     * See ProjectService for example usage.
     */
    UseDbtLs = 'use-dbt-ls',

    /**
     * Used for tests only, and is not a valid Posthog feature flag.
     */
    _Test_ = '_test_flag_',
}
