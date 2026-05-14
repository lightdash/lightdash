import { type ApiError, type FeatureFlag } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../api';

/**
 * Get a feature flag value from the backend, which resolves through the
 * unified DB-backed flag system (env-var allowlists → per-flag config
 * handlers → DB).
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
