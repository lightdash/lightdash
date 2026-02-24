import { FeatureFlags } from '@lightdash/common';
import { useServerFeatureFlag } from './useServerOrClientFeatureFlag';

export const useIsTableColumnCustomizationEnabled = () => {
    const { data } = useServerFeatureFlag(
        FeatureFlags.EnableTableColumnCustomization,
    );
    return data?.enabled ?? false;
};
