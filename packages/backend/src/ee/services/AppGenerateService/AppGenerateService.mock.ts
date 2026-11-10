import { type FeatureFlags } from '@lightdash/common';

/** A featureFlagModel stub: listed flags take their value, every other flag is on. */
export const featureFlagModelWith = (
    flags: Partial<Record<FeatureFlags, boolean>> = {},
) => ({
    get: vi.fn(async ({ featureFlagId }: { featureFlagId: string }) => ({
        enabled: flags[featureFlagId as FeatureFlags] ?? true,
    })),
});
