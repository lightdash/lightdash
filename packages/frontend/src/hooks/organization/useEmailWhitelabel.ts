import {
    type ApiError,
    type CreateEmailWhitelabel,
    type OrganizationEmailWhitelabel,
    type UpdateEmailWhitelabel,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';
import { useOrganization } from './useOrganization';

const QUERY_KEY = ['organization_email_whitelabel'];

const getEmailWhitelabel = async (organizationUuid: string) =>
    lightdashApi<OrganizationEmailWhitelabel | null>({
        url: `/org/${organizationUuid}/email-whitelabel`,
        method: 'GET',
        body: undefined,
    });

const setupEmailWhitelabel = async (
    organizationUuid: string,
    data: CreateEmailWhitelabel,
) =>
    lightdashApi<OrganizationEmailWhitelabel>({
        url: `/org/${organizationUuid}/email-whitelabel`,
        method: 'PUT',
        body: JSON.stringify(data),
    });

const verifyEmailWhitelabel = async (organizationUuid: string) =>
    lightdashApi<OrganizationEmailWhitelabel>({
        url: `/org/${organizationUuid}/email-whitelabel/verify`,
        method: 'POST',
        body: undefined,
    });

const updateEmailWhitelabel = async (
    organizationUuid: string,
    data: UpdateEmailWhitelabel,
) =>
    lightdashApi<OrganizationEmailWhitelabel>({
        url: `/org/${organizationUuid}/email-whitelabel`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

const deleteEmailWhitelabel = async (organizationUuid: string) =>
    lightdashApi<undefined>({
        url: `/org/${organizationUuid}/email-whitelabel`,
        method: 'DELETE',
        body: undefined,
    });

const useOrganizationUuid = () => {
    const { data: organization } = useOrganization();
    return organization?.organizationUuid;
};

export const useEmailWhitelabel = () => {
    const organizationUuid = useOrganizationUuid();
    return useQuery<OrganizationEmailWhitelabel | null, ApiError>({
        queryKey: [...QUERY_KEY, organizationUuid],
        queryFn: () => getEmailWhitelabel(organizationUuid!),
        enabled: !!organizationUuid,
    });
};

export const useSetupEmailWhitelabel = () => {
    const organizationUuid = useOrganizationUuid();
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<
        OrganizationEmailWhitelabel,
        ApiError,
        CreateEmailWhitelabel
    >((data) => setupEmailWhitelabel(organizationUuid!, data), {
        mutationKey: ['organization_email_whitelabel', 'setup'],
        onSuccess: async (data) => {
            queryClient.setQueryData([...QUERY_KEY, organizationUuid], data);
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
    const organizationUuid = useOrganizationUuid();
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess, showToastInfo } = useToaster();
    return useMutation<OrganizationEmailWhitelabel, ApiError, void>(
        () => verifyEmailWhitelabel(organizationUuid!),
        {
            mutationKey: ['organization_email_whitelabel', 'verify'],
            onSuccess: async (data) => {
                queryClient.setQueryData(
                    [...QUERY_KEY, organizationUuid],
                    data,
                );
                if (data.isVerified) {
                    showToastSuccess({ title: `${data.domain} verified` });
                } else {
                    showToastInfo({
                        title: 'Still waiting on DNS',
                        subtitle:
                            'DNS changes can take up to 24 hours to propagate. We’ll keep checking and email you when it’s verified.',
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
    const organizationUuid = useOrganizationUuid();
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<
        OrganizationEmailWhitelabel,
        ApiError,
        UpdateEmailWhitelabel
    >((data) => updateEmailWhitelabel(organizationUuid!, data), {
        mutationKey: ['organization_email_whitelabel', 'update'],
        onSuccess: async (data) => {
            queryClient.setQueryData([...QUERY_KEY, organizationUuid], data);
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
    const organizationUuid = useOrganizationUuid();
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<undefined, ApiError, void>(
        () => deleteEmailWhitelabel(organizationUuid!),
        {
            mutationKey: ['organization_email_whitelabel', 'delete'],
            onSuccess: async () => {
                queryClient.setQueryData(
                    [...QUERY_KEY, organizationUuid],
                    null,
                );
                await queryClient.invalidateQueries(QUERY_KEY);
                showToastSuccess({ title: 'Sending domain removed' });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to remove sending domain',
                    apiError: error,
                });
            },
        },
    );
};
