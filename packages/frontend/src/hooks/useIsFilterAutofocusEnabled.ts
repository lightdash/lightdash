import { FeatureFlags } from '@lightdash/common';
import { useServerFeatureFlag } from './useServerOrClientFeatureFlag';

export function useIsFilterAutofocusEnabled(): boolean {
    const { data } = useServerFeatureFlag(
        FeatureFlags.EnableFilterAutofocusFix,
    );
    return data?.enabled ?? false;
}
