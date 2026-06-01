import { FeatureFlags } from '@lightdash/common';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';

/**
 * Returns whether the `pull-requests` feature flag is on. Gates the
 * project-settings "Pull requests" section and route.
 */
export const useIsPullRequestsEnabled = (): boolean => {
    const { data } = useServerFeatureFlag(FeatureFlags.PullRequests);
    return data?.enabled ?? false;
};
