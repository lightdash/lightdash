import { ApiError, Organisation } from '@lightdash/common';
import { useQuery } from 'react-query';
import { lightdashApi } from '../../api';

const getOrganisation = async () =>
    lightdashApi<Organisation>({
        url: `/org`,
        method: 'GET',
        body: undefined,
    });

export const useOrganisation = (refetchOnMount?: boolean) =>
    useQuery<Organisation, ApiError>({
        queryKey: ['organisation'],
        queryFn: getOrganisation,
        refetchOnMount,
    });
