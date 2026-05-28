import {
    type ApiError,
    type ConfirmDomainVerification,
    type DomainVerificationStatus,
    type RequestDomainVerification,
    type VerifiedDomain,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';

const QUERY_KEY = ['organization_verified_domains'];

const getVerifiedDomains = async () =>
    lightdashApi<VerifiedDomain[]>({
        url: '/org/domains',
        method: 'GET',
        body: undefined,
    });

const requestDomainVerification = async (data: RequestDomainVerification) =>
    lightdashApi<DomainVerificationStatus>({
        url: '/org/domains/verify',
        method: 'POST',
        body: JSON.stringify(data),
    });

const confirmDomainVerification = async (data: ConfirmDomainVerification) =>
    lightdashApi<DomainVerificationStatus>({
        url: '/org/domains/confirm',
        method: 'POST',
        body: JSON.stringify(data),
    });

const deleteVerifiedDomain = async (domain: string) =>
    lightdashApi<undefined>({
        url: `/org/domains/${encodeURIComponent(domain)}`,
        method: 'DELETE',
        body: undefined,
    });

export const useVerifiedDomains = () =>
    useQuery<VerifiedDomain[], ApiError>({
        queryKey: QUERY_KEY,
        queryFn: getVerifiedDomains,
    });

export const useRequestDomainVerification = () => {
    const { showToastApiError } = useToaster();
    return useMutation<
        DomainVerificationStatus,
        ApiError,
        RequestDomainVerification
    >(requestDomainVerification, {
        mutationKey: ['organization_verified_domains', 'verify'],
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to send verification code',
                apiError: error,
            });
        },
    });
};

export const useConfirmDomainVerification = () => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<
        DomainVerificationStatus,
        ApiError,
        ConfirmDomainVerification
    >(confirmDomainVerification, {
        mutationKey: ['organization_verified_domains', 'confirm'],
        onSuccess: async (status) => {
            if (status.isVerified) {
                await queryClient.invalidateQueries(QUERY_KEY);
                showToastSuccess({
                    title: `${status.domain} verified`,
                });
            }
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to verify domain',
                apiError: error,
            });
        },
    });
};

export const useDeleteVerifiedDomain = () => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<undefined, ApiError, string>(deleteVerifiedDomain, {
        mutationKey: ['organization_verified_domains', 'delete'],
        onSuccess: async () => {
            await queryClient.invalidateQueries(QUERY_KEY);
            showToastSuccess({ title: 'Verified domain removed' });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to remove verified domain',
                apiError: error,
            });
        },
    });
};
