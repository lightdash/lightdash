import { type FeatureFlags } from '@lightdash/common';
import { useFeatureFlagEnabled as useFeatureFlagEnabledPosthog } from 'posthog-js/react';

/**
 * Thin wrapper around posthog's useFeatureFlagEnabled hook that is aware
 * of our FeatureFlags enum.
 */
export const useFeatureFlagEnabled = (featureFlag: FeatureFlags) =>
    useFeatureFlagEnabledPosthog(featureFlag) === true;
