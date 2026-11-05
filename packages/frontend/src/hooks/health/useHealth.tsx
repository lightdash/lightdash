import {
    type ApiError,
    type ApiHealthResults,
    type HealthState,
} from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { type LightdashApi } from '../../api';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import useQueryError from '../useQueryError';

const getHealthState = async (lightdashApi: LightdashApi) =>
    lightdashApi<ApiHealthResults>({
        url: `/health?skipMigrationCheck=true`,
        method: 'GET',
        body: undefined,
    });

const useHealth = (
    useQueryOptions?: UseQueryOptions<HealthState, ApiError>,
) => {
    const lightdashApi = useLightdashApi();
    const setErrorResponse = useQueryError();

    const health = useQuery<HealthState, ApiError>({
        queryKey: ['health'],
        queryFn: () => getHealthState(lightdashApi),
        onError: (result) => {
            setErrorResponse(result);
        },
        ...useQueryOptions,
    });

    return health;
};

export default useHealth;
