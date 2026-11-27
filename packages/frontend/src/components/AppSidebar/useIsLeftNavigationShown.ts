import { FeatureFlags } from '@lightdash/common';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import { useCompactNavigation } from '../NavBar/useCompactNavigation';

/** Whether the page is drawn with the left sidebar. Phones keep the top navbar. */
export const useIsLeftNavigationShown = (): boolean => {
    const leftNavigationFlag = useServerFeatureFlag(
        FeatureFlags.LeftNavigation,
    );
    const isCompact = useCompactNavigation();
    return leftNavigationFlag.data?.enabled === true && !isCompact;
};
