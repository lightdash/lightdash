import { FeatureFlags } from '@lightdash/common';
import { useServerFeatureFlag } from './useServerOrClientFeatureFlag';

export function useIsTableColumnWidthStabilizationEnabled(): boolean {
    const { data } = useServerFeatureFlag(
        FeatureFlags.EnableTableColumnWidthStabilization,
    );
    return data?.enabled ?? false;
}
