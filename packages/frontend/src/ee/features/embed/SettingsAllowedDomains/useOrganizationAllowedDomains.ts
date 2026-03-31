import {
    type AllowedDomain,
    type ApiError,
    type CreateAllowedDomain,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';

const getAllowedDomains = async () =>
    lightdashApi<AllowedDomain[]>({
        url: `/org/allowedDomains`,
        method: 'GET',
        body: undefined,
    });

const addAllowedDomain = async (
    body: CreateAllowedDomain,
): Promise<AllowedDomain> =>
    lightdashApi({
        url: `/org/allowedDomains`,
        method: 'POST',
        body: JSON.stringify(body),
    }) as unknown as Promise<AllowedDomain>;

const deleteAllowedDomain = async (domainUuid: string) =>
    lightdashApi<undefined>({
        url: `/org/allowedDomains/${domainUuid}`,
        method: 'DELETE',
        body: undefined,
    });

export const useOrganizationAllowedDomains = () =>
    useQuery<AllowedDomain[], ApiError>({
        queryKey: ['organization_allowed_domains'],
        queryFn: getAllowedDomains,
    });

export const useAddOrganizationAllowedDomain = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation<AllowedDomain, ApiError, CreateAllowedDomain>(
        addAllowedDomain,
        {
            mutationKey: ['organization_allowed_domains_add'],
            onSuccess: async () => {
                await queryClient.invalidateQueries([
                    'organization_allowed_domains',
                ]);
                showToastSuccess({
                    title: 'Domain added successfully',
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to add domain',
                    apiError: error,
                });
            },
        },
    );
};

export const useDeleteOrganizationAllowedDomain = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation<undefined, ApiError, string>(deleteAllowedDomain, {
        mutationKey: ['organization_allowed_domains_delete'],
        onSuccess: async () => {
            await queryClient.invalidateQueries([
                'organization_allowed_domains',
            ]);
            showToastSuccess({
                title: 'Domain removed',
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to remove domain',
                apiError: error,
            });
        },
    });
};
