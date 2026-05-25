import { FeatureFlags } from '@lightdash/common';
import { useServerFeatureFlag } from './useServerOrClientFeatureFlag';

/**
 * Returns whether the `pivot-row-grouping` feature flag is on. Wraps the
 * standard server-flag lookup so callers don't repeat the boilerplate.
 */
export const useIsPivotRowGroupingEnabled = (): boolean => {
    const { data } = useServerFeatureFlag(FeatureFlags.PivotRowGrouping);
    return data?.enabled ?? false;
};
