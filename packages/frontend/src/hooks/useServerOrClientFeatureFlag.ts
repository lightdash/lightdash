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
 * Use Client Feature Flag to get the feature flag from the client directly from posthog.
 *
 * @param featureFlag - The feature flag to get.
 * @returns boolean if the feature flag is enabled.
 */
export const useClientFeatureFlag = (
    featureFlag: FeatureFlags | CommercialFeatureFlags,
) => useFeatureFlagEnabledPosthog(featureFlag) === true;

/**
 * Use Server Feature Flag to get the feature flag from the server.
 * This is useful to:
 * - Get the feature flag from the server (which works well on shared instances)
 * - When implemented, get a mix of Posthog and Environment variables feature flags (not always implemented)
 *
 * @param featureFlagId - The feature flag to get.
 * @returns The feature flag.
 */
export const useServerFeatureFlag = (featureFlagId: string) => {
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
