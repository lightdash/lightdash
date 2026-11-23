import { FeatureFlags } from '@lightdash/common';
import useDashboardStorage from '../../hooks/dashboard/useDashboardStorage';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import { useCompactNavigation } from '../NavBar/useCompactNavigation';

/**
 * Whether the page is drawn with the left sidebar. Phones keep the top
 * navbar, and so does editing a dashboard chart: its bar holds the way back
 * to the dashboard.
 */
export const useIsLeftNavigationShown = (): boolean => {
    const leftNavigationFlag = useServerFeatureFlag(
        FeatureFlags.LeftNavigation,
    );
    const isCompact = useCompactNavigation();
    const { isEditingDashboardChart } = useDashboardStorage();
    return (
        leftNavigationFlag.data?.enabled === true &&
        !isCompact &&
        !isEditingDashboardChart
    );
};
