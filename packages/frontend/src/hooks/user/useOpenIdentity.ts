import {
    type ApiError,
    type DeleteOpenIdentity,
    type OpenIdIdentitySummary,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../../api';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import useToaster from '../toaster/useToaster';

const deleteOpenIdentity = async (
    lightdashApi: LightdashApi,
    data: DeleteOpenIdentity,
) =>
    lightdashApi<null>({
        url: `/user/identity`,
        method: 'DELETE',
        body: JSON.stringify(data),
    });

export const useDeleteOpenIdentityMutation = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<null, ApiError, DeleteOpenIdentity>(
        (data: DeleteOpenIdentity) => deleteOpenIdentity(lightdashApi, data),
        {
            onSuccess: async () => {
                await queryClient.invalidateQueries(['user_identities']);
                showToastSuccess({
                    title: `Deleted! Social login was deleted.`,
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to delete social login`,
                    apiError: error,
                });
            },
        },
    );
};

const getIdentitiesQuery = async (lightdashApi: LightdashApi) =>
    lightdashApi<
        Record<OpenIdIdentitySummary['issuerType'], OpenIdIdentitySummary[]>
    >({
        url: '/user/identities',
        method: 'GET',
        body: undefined,
    });

export const useOpenIdentities = () => {
    const lightdashApi = useLightdashApi();
    return useQuery<
        Record<OpenIdIdentitySummary['issuerType'], OpenIdIdentitySummary[]>,
        ApiError
    >({
        queryKey: ['user_identities'],
        queryFn: () => getIdentitiesQuery(lightdashApi),
    });
};
