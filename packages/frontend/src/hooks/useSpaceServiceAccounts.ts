import {
    type ApiError,
    type ApiSpaceServiceAccountCandidatesResponse,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useLightdashApi } from '../providers/LightdashApi/useLightdashApi';

export const useSpaceServiceAccounts = (
    projectUuid: string,
    spaceUuid: string,
    enabled: boolean,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<
        ApiSpaceServiceAccountCandidatesResponse['results'],
        ApiError
    >({
        queryKey: ['space_service_accounts', projectUuid, spaceUuid],
        queryFn: () =>
            lightdashApi<ApiSpaceServiceAccountCandidatesResponse['results']>({
                url: `/projects/${projectUuid}/spaces/${spaceUuid}/share/service-accounts`,
                method: 'GET',
            }),
        enabled,
    });
};
