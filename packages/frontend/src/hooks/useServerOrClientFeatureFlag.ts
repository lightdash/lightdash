import { type ApiError, type FeatureFlag } from '@lightdash/common';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../api';

export const FEATURE_FLAG_QUERY_KEY = 'feature-flag';

/**
 * Flags resolve per user/organization on the server, so anything that changes
 * that context (creating or joining an org, creating the first project — which
 * enables org overrides) has to refresh them. This refetches rather than
 * invalidates because `refetchOnMount: false` means a stale cached flag would
 * otherwise be served to the next page that mounts.
 */
export const refetchFeatureFlags = (queryClient: QueryClient) =>
    queryClient.refetchQueries({
        queryKey: [FEATURE_FLAG_QUERY_KEY],
        type: 'all',
    });

/**
 * Get a feature flag value from the backend, which resolves through the
 * unified DB-backed flag system (env-var allowlists → per-flag config
 * handlers → DB).
 */
export const useServerFeatureFlag = (
    featureFlagId: string,
    options?: { retry?: number | boolean },
) => {
    return useQuery<FeatureFlag, ApiError>(
        [FEATURE_FLAG_QUERY_KEY, featureFlagId],
        () => {
            return lightdashApi<FeatureFlag>({
                url: `/feature-flag/${featureFlagId}`,
                version: 'v2',
                method: 'GET',
                body: undefined,
            });
        },
        {
            retry: options?.retry ?? false,
            refetchOnMount: false,
        },
    );
};
