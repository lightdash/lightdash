import { type ApiError, type Organization } from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
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
