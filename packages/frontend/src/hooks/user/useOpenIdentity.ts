import {
    ApiError,
    DeleteOpenIdentity,
    OpenIdIdentitySummary,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';

const deleteOpenIdentity = async (data: DeleteOpenIdentity) =>
    lightdashApi<null>({
        url: `/user/identity`,
        method: 'DELETE',
        body: JSON.stringify(data),
    });

export const useDeleteOpenIdentityMutation = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError } = useToaster();
    return useMutation<null, ApiError, DeleteOpenIdentity>(deleteOpenIdentity, {
        onSuccess: async () => {
            await queryClient.invalidateQueries(['user_identities']);
            showToastSuccess({
                title: `Deleted! Social login was deleted.`,
            });
        },
        onError: (error) => {
            showToastError({
                title: `Failed to delete social login`,
                subtitle: error.error.message,
            });
        },
    });
};

const getIdentitiesQuery = async () =>
    lightdashApi<
        Record<OpenIdIdentitySummary['issuerType'], OpenIdIdentitySummary[]>
    >({
        url: '/user/identities',
        method: 'GET',
        body: undefined,
    });

export const useOpenIdentities = () =>
    useQuery<
        Record<OpenIdIdentitySummary['issuerType'], OpenIdIdentitySummary[]>,
        ApiError
    >({
        queryKey: ['user_identities'],
        queryFn: getIdentitiesQuery,
    });
