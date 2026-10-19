import {
    type AllowedEmailDomains,
    type ApiError,
    type UpdateAllowedEmailDomains,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../../api';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import useToaster from '../toaster/useToaster';

const getAllowedEmailDomainsQuery = async (lightdashApi: LightdashApi) =>
    lightdashApi<AllowedEmailDomains>({
        url: `/org/allowedEmailDomains`,
        method: 'GET',
        body: undefined,
    });

const updateAllowedEmailDomainsQuery = async (
    lightdashApi: LightdashApi,
    data: UpdateAllowedEmailDomains,
) =>
    lightdashApi<AllowedEmailDomains>({
        url: `/org/allowedEmailDomains`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

export const useAllowedEmailDomains = () => {
    const lightdashApi = useLightdashApi();
    return useQuery<AllowedEmailDomains, ApiError>({
        queryKey: ['allowed_email_domains'],
        queryFn: () => getAllowedEmailDomainsQuery(lightdashApi),
    });
};

export const useUpdateAllowedEmailDomains = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<
        AllowedEmailDomains,
        ApiError,
        UpdateAllowedEmailDomains
    >(
        (data: UpdateAllowedEmailDomains) =>
            updateAllowedEmailDomainsQuery(lightdashApi, data),
        {
            mutationKey: ['allowed_email_domains_update'],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['allowed_email_domains']);
                showToastSuccess({
                    title: 'Success! Allowed email domains were updated',
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to update allowed email domains',
                    apiError: error,
                });
            },
        },
    );
};
