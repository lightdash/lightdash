import {
    assertUnreachable,
    FEATURE_NOT_ENABLED_CODE,
    FeatureFlags,
    type ApiBigqueryWorkloadIdentityResponse,
    type ApiError,
    type BigqueryWorkloadIdentity,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

export type WorkloadIdentityStatus =
    | { kind: 'loading' }
    | { kind: 'available'; identity: BigqueryWorkloadIdentity }
    | { kind: 'not-enabled' }
    | { kind: 'identity-error'; onRetry: () => void }
    | { kind: 'flag-error'; onRetry: () => void };

export const useBigqueryWorkloadIdentity = (
    projectUuid: string | undefined,
): WorkloadIdentityStatus => {
    const lightdashApi = useLightdashApi();
    const flag = useServerFeatureFlag(
        FeatureFlags.BigqueryWorkloadIdentityAuth,
    );
    const query = projectUuid
        ? `?${new URLSearchParams({ projectUuid }).toString()}`
        : '';

    const identity = useQuery<
        ApiBigqueryWorkloadIdentityResponse['results'],
        ApiError
    >({
        queryKey: ['bigqueryWorkloadIdentity', projectUuid],
        queryFn: () =>
            lightdashApi<ApiBigqueryWorkloadIdentityResponse['results']>({
                url: `/bigquery/workload-identity${query}`,
                method: 'GET',
                body: undefined,
            }),
        enabled: flag.data?.enabled === true,
        // Recheck organization availability whenever the connection form opens.
        staleTime: 0,
    });

    switch (flag.status) {
        case 'loading':
            return { kind: 'loading' };
        case 'error':
            return { kind: 'flag-error', onRetry: () => void flag.refetch() };
        case 'success':
            if (!flag.data.enabled) return { kind: 'not-enabled' };
            break;
        default:
            return assertUnreachable(flag, 'Unknown feature flag query state');
    }

    switch (identity.status) {
        case 'loading':
            return { kind: 'loading' };
        case 'error':
            return identity.error.error.data?.code === FEATURE_NOT_ENABLED_CODE
                ? { kind: 'not-enabled' }
                : {
                      kind: 'identity-error',
                      onRetry: () => void identity.refetch(),
                  };
        case 'success':
            return { kind: 'available', identity: identity.data };
        default:
            return assertUnreachable(identity, 'Unknown identity query state');
    }
};
