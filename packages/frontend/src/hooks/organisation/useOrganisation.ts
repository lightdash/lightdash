import { ApiError, Organisation } from '@lightdash/common';
import { useMutation, useQueries, useQuery, useQueryClient } from 'react-query';
import { UseQueryOptions } from 'react-query/types/react/types';
import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';

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

const deleteDashboard = async (id: string) =>
    lightdashApi<undefined>({
        url: `/org/${id}`,
        method: 'DELETE',
        body: undefined,
    });

export const useDeleteOrganisationMutation = () => {
    const { showToastError } = useToaster();
    return useMutation<undefined, ApiError, string>(deleteDashboard, {
        onSuccess: async () => {
            window.location.href = '/register';
        },
        onError: (error) => {
            showToastError({
                title: `Failed to delete dashboard`,
                subtitle: error.error.message,
            });
        },
    });
};
