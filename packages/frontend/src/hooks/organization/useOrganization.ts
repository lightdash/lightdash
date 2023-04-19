import { ApiError, Organization } from '@lightdash/common';
import { useQuery } from 'react-query';
import { UseQueryOptions } from 'react-query/types/react/types';
import { lightdashApi } from '../../api';

const getOrganization = async () =>
    lightdashApi<Organization>({
        url: `/org`,
        method: 'GET',
        body: undefined,
    });

export const useOrganization = (
    useQueryOptions?: UseQueryOptions<Organization, ApiError>,
) =>
    useQuery<Organization, ApiError>({
        queryKey: ['organization'],
        queryFn: getOrganization,
        ...useQueryOptions,
    });
