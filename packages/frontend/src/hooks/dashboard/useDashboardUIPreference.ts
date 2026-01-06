import { FeatureFlags } from '@lightdash/common';
import { useLocalStorage } from '@mantine-8/hooks';
import { useFeatureFlagEnabled } from '../useFeatureFlagEnabled';

export type DashboardUIVersion = 'v1' | 'v2';

const STORAGE_KEY = 'lightdash-dashboard-ui-version';

/**
 * Hook to manage user preference for Dashboard UI version.
 * Allows users to toggle between the classic (v1) and new (v2) dashboard UI.
 * The preference is persisted in localStorage.
 *
 * If the DashboardRedesign feature flag is enabled, users are forced to use v2.
 * If the feature flag is disabled, users can opt-in to v2 via localStorage preference.
 */
export const useDashboardUIPreference = () => {
    const [preference, setPreference] = useLocalStorage<DashboardUIVersion>({
        key: STORAGE_KEY,
        defaultValue: 'v1',
    });

    const isDashboardRedesignFlagEnabled = useFeatureFlagEnabled(
        FeatureFlags.DashboardRedesign,
    );

    // If feature flag is ON, force v2. Otherwise, use user preference.
    const isDashboardRedesignEnabled =
        isDashboardRedesignFlagEnabled || preference === 'v2';

    return {
        isDashboardRedesignEnabled,
        isDashboardRedesignFlagEnabled,
        setPreference,
    };
};
