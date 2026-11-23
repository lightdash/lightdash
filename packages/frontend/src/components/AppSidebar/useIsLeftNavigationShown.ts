import { FeatureFlags } from '@lightdash/common';
import { useLocalStorage } from '@mantine/hooks';
import { useEffect } from 'react';
import useDashboardStorage from '../../hooks/dashboard/useDashboardStorage';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import { useCompactNavigation } from '../NavBar/useCompactNavigation';

const LEFT_NAVIGATION_REMEMBERED_STORAGE_KEY = 'left-navigation:enabled';

/**
 * The flag's last answer in this browser stands in while it loads, so a
 * reload does not draw the top navbar first and then swap the whole page.
 */
const useLeftNavigationFlag = (): boolean => {
    const { data, isLoading } = useServerFeatureFlag(
        FeatureFlags.LeftNavigation,
    );
    const [remembered, setRemembered] = useLocalStorage<boolean>({
        key: LEFT_NAVIGATION_REMEMBERED_STORAGE_KEY,
        defaultValue: false,
        getInitialValueInEffect: false,
    });
    const resolved = data?.enabled;

    useEffect(() => {
        if (resolved !== undefined && resolved !== remembered) {
            setRemembered(resolved);
        }
    }, [resolved, remembered, setRemembered]);

    return isLoading ? remembered === true : resolved === true;
};

/**
 * Whether the page is drawn with the left sidebar. Phones keep the top
 * navbar, and so does editing a dashboard chart: its bar holds the way back
 * to the dashboard.
 */
export const useIsLeftNavigationShown = (): boolean => {
    const isLeftNavigationEnabled = useLeftNavigationFlag();
    const isCompact = useCompactNavigation();
    const { isEditingDashboardChart } = useDashboardStorage();
    return isLeftNavigationEnabled && !isCompact && !isEditingDashboardChart;
};
