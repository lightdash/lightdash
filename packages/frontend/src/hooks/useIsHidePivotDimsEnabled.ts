import { FeatureFlags } from '@lightdash/common';
import { useServerFeatureFlag } from './useServerOrClientFeatureFlag';

/**
 * Returns whether the `hide-pivot-dimensions` feature flag is on. Wraps the
 * standard server-flag lookup so callers don't repeat the boilerplate.
 */
export const useIsHidePivotDimsEnabled = (): boolean => {
    const { data } = useServerFeatureFlag(FeatureFlags.HidePivotDimensions);
    return data?.enabled ?? false;
};
