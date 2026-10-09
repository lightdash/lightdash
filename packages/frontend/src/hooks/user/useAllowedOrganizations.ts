import { type ApiError, type UserAllowedOrganization } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { type LightdashApi } from '../../api';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';

const getAllowedOrganizations = async (
    lightdashApi: LightdashApi,
): Promise<UserAllowedOrganization[]> =>
    lightdashApi<UserAllowedOrganization[]>({
        url: `/user/me/allowedOrganizations`,
        method: 'GET',
        body: undefined,
    });

const useAllowedOrganizations = () => {
    const lightdashApi = useLightdashApi();
    return useQuery<UserAllowedOrganization[], ApiError>({
        queryKey: ['user-allowed-organizations'],
        queryFn: () => getAllowedOrganizations(lightdashApi),
    });
};

export default useAllowedOrganizations;
