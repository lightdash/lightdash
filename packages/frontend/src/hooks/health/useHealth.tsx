import {
    type ApiError,
    type ApiHealthResults,
    type HealthState,
} from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { lightdashApi } from '../../api';
import useQueryError from '../useQueryError';

const getHealthState = async () =>
    lightdashApi<ApiHealthResults>({
        url: `/health`,
        method: 'GET',
        body: undefined,
    });

const useHealth = (
    useQueryOptions?: UseQueryOptions<HealthState, ApiError>,
) => {
    const setErrorResponse = useQueryError();

    const health = useQuery<HealthState, ApiError>({
        queryKey: ['health'],
        queryFn: getHealthState,
        onError: (result) => {
            setErrorResponse(result);
        },
        // Don't retry /health: it's the gating signal for defaultQueryRetry
        // (retrying delays the gate for every other query) and it's already
        // refetched on mount / route change.
        retry: false,
        ...useQueryOptions,
    });

    return health;
};

export default useHealth;
