import { FeatureFlags } from '@lightdash/common';
import { useServerFeatureFlag } from './useServerOrClientFeatureFlag';

export const useDrillFeatureFlag = () => {
    const { data } = useServerFeatureFlag(FeatureFlags.CuratedDrillInto);
    return data?.enabled ?? false;
};
