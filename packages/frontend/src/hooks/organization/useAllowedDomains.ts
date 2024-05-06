import {
    type AllowedEmailDomains,
    type ApiError,
    type UpdateAllowedEmailDomains,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';

const getAllowedEmailDomainsQuery = async () =>
    lightdashApi<AllowedEmailDomains>({
        url: `/org/allowedEmailDomains`,
        method: 'GET',
        body: undefined,
    });

const updateAllowedEmailDomainsQuery = async (
    data: UpdateAllowedEmailDomains,
) =>
    lightdashApi<AllowedEmailDomains>({
        url: `/org/allowedEmailDomains`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

export const useAllowedEmailDomains = () =>
    useQuery<AllowedEmailDomains, ApiError>({
        queryKey: ['allowed_email_domains'],
        queryFn: getAllowedEmailDomainsQuery,
    });

export const useUpdateAllowedEmailDomains = () => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<
        AllowedEmailDomains,
        ApiError,
        UpdateAllowedEmailDomains
    >(updateAllowedEmailDomainsQuery, {
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
    });
};
