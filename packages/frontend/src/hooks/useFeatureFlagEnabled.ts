import {
    type ApiError,
    type CommercialFeatureFlags,
    type FeatureFlag,
    type FeatureFlags,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useFeatureFlagEnabled as useFeatureFlagEnabledPosthog } from 'posthog-js/react';
import { lightdashApi } from '../api';

/**
 * Thin wrapper around posthog's useFeatureFlagEnabled hook that is aware
 * of our FeatureFlags enum.
 */
export const useFeatureFlagEnabled = (
    featureFlag: FeatureFlags | CommercialFeatureFlags,
) => useFeatureFlagEnabledPosthog(featureFlag) === true;

/**
 * Use our own endpoint to get the feature flag from multiple sources.
 */
export const useFeatureFlag = (featureFlagId: string) => {
    return useQuery<FeatureFlag, ApiError>(
        ['feature-flag', featureFlagId],
        () => {
            return lightdashApi<FeatureFlag>({
                url: `/feature-flag/${featureFlagId}`,
                version: 'v2',
                method: 'GET',
                body: undefined,
            });
        },
        {
            retry: false,
            refetchOnMount: false,
        },
    );
};
