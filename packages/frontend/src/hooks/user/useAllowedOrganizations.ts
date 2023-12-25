import { ApiError, UserAllowedOrganization } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../api';

const getAllowedOrganizations = async (): Promise<UserAllowedOrganization[]> =>
    lightdashApi<UserAllowedOrganization[]>({
        url: `/user/me/allowedOrganizations`,
        method: 'GET',
        body: undefined,
    });

const useAllowedOrganizations = () => {
    return useQuery<UserAllowedOrganization[], ApiError>({
        queryKey: ['user-allowed-organizations'],
        queryFn: getAllowedOrganizations,
    });
};

export default useAllowedOrganizations;
