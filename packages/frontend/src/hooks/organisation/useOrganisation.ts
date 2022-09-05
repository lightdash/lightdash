import { ApiError, Organisation } from '@lightdash/common';
import { useQuery } from 'react-query';
import { UseQueryOptions } from 'react-query/types/react/types';
import { lightdashApi } from '../../api';

const getOrganisation = async () =>
    lightdashApi<Organisation>({
        url: `/org`,
        method: 'GET',
        body: undefined,
    });

export const useOrganisation = (
    useQueryOptions?: UseQueryOptions<Organisation, ApiError>,
) =>
    useQuery<Organisation, ApiError>({
        queryKey: ['organisation'],
        queryFn: getOrganisation,
        ...useQueryOptions,
    });
