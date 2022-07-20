import { ApiError, Organisation } from '@lightdash/common';
import { useQuery } from 'react-query';
import { lightdashApi } from '../../api';

const getOrganisation = async () =>
    lightdashApi<Organisation>({
        url: `/org`,
        method: 'GET',
        body: undefined,
    });

export const useOrganisation = () =>
    useQuery<Organisation, ApiError>({
        queryKey: ['organisation'],
        queryFn: getOrganisation,
        retry: false,
        refetchOnMount: false,
    });
