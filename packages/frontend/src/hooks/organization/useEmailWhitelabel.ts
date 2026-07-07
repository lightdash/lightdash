import {
    type ApiError,
    type CreateEmailWhitelabel,
    type OrganizationEmailWhitelabel,
    type UpdateEmailWhitelabel,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';

const QUERY_KEY = ['organization_email_whitelabel'];

const getEmailWhitelabel = async () =>
    lightdashApi<OrganizationEmailWhitelabel | null>({
        url: '/org/email-whitelabel',
        method: 'GET',
        body: undefined,
    });

const setupEmailWhitelabel = async (data: CreateEmailWhitelabel) =>
    lightdashApi<OrganizationEmailWhitelabel>({
        url: '/org/email-whitelabel',
        method: 'PUT',
        body: JSON.stringify(data),
    });

const verifyEmailWhitelabel = async () =>
    lightdashApi<OrganizationEmailWhitelabel>({
        url: '/org/email-whitelabel/verify',
        method: 'POST',
        body: undefined,
    });

const updateEmailWhitelabel = async (data: UpdateEmailWhitelabel) =>
    lightdashApi<OrganizationEmailWhitelabel>({
        url: '/org/email-whitelabel',
        method: 'PATCH',
        body: JSON.stringify(data),
    });

const deleteEmailWhitelabel = async () =>
    lightdashApi<undefined>({
        url: '/org/email-whitelabel',
        method: 'DELETE',
        body: undefined,
    });

export const useEmailWhitelabel = () =>
    useQuery<OrganizationEmailWhitelabel | null, ApiError>({
        queryKey: QUERY_KEY,
        queryFn: getEmailWhitelabel,
    });

export const useSetupEmailWhitelabel = () => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<
        OrganizationEmailWhitelabel,
        ApiError,
        CreateEmailWhitelabel
    >(setupEmailWhitelabel, {
        mutationKey: ['organization_email_whitelabel', 'setup'],
        onSuccess: async (data) => {
            queryClient.setQueryData(QUERY_KEY, data);
            showToastSuccess({
                title: 'Sending domain set up — add the DNS records to verify',
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to set up sending domain',
                apiError: error,
            });
        },
    });
};

export const useVerifyEmailWhitelabel = () => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess, showToastInfo } = useToaster();
    return useMutation<OrganizationEmailWhitelabel, ApiError, void>(
        verifyEmailWhitelabel,
        {
            mutationKey: ['organization_email_whitelabel', 'verify'],
            onSuccess: async (data) => {
                queryClient.setQueryData(QUERY_KEY, data);
                if (data.isVerified) {
                    showToastSuccess({ title: `${data.domain} verified` });
                } else {
                    showToastInfo({
                        title: 'Still waiting on DNS',
                        subtitle: 'DNS changes can take up to 24 hours to propagate. We’ll keep checking and email you when it’s verified.',
                    });
                }
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to verify sending domain',
                    apiError: error,
                });
            },
        },
    );
};

export const useUpdateEmailWhitelabel = () => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<
        OrganizationEmailWhitelabel,
        ApiError,
        UpdateEmailWhitelabel
    >(updateEmailWhitelabel, {
        mutationKey: ['organization_email_whitelabel', 'update'],
        onSuccess: async (data) => {
            queryClient.setQueryData(QUERY_KEY, data);
            showToastSuccess({
                title: data.isEnabled
                    ? 'Sending from your domain is now enabled'
                    : 'Sending from your domain is now disabled',
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to update sending domain',
                apiError: error,
            });
        },
    });
};

export const useDeleteEmailWhitelabel = () => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<undefined, ApiError, void>(deleteEmailWhitelabel, {
        mutationKey: ['organization_email_whitelabel', 'delete'],
        onSuccess: async () => {
            queryClient.setQueryData(QUERY_KEY, null);
            await queryClient.invalidateQueries(QUERY_KEY);
            showToastSuccess({ title: 'Sending domain removed' });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to remove sending domain',
                apiError: error,
            });
        },
    });
};
