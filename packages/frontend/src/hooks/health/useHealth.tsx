import {
    type ApiError,
    type ApiHealthResults,
    type HealthState,
} from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { useEffect } from 'react';
import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';

const getHealthState = async () =>
    lightdashApi<ApiHealthResults>({
        url: `/health`,
        method: 'GET',
        body: undefined,
    });

const useHealth = (
    useQueryOptions?: UseQueryOptions<HealthState, ApiError>,
) => {
    const health = useQuery<HealthState, ApiError>({
        queryKey: ['health'],
        queryFn: getHealthState,
        ...useQueryOptions,
    });

    const { showToastApiError } = useToaster();

    useEffect(() => {
        if (health.error) {
            showToastApiError({
                key: 'health',
                autoClose: false,
                apiError: health.error.error,
            });
        }
    }, [health, showToastApiError]);

    return health;
};

export default useHealth;
