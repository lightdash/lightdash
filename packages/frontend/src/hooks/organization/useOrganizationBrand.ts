import {
    type ApiError,
    type OrganizationBrand,
    type UpdateOrganizationBrandRequest,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';

const getOrganizationBrand = async () =>
    lightdashApi<OrganizationBrand | null>({
        url: `/org/brand`,
        method: 'GET',
        body: undefined,
    });

export const useOrganizationBrand = () =>
    useQuery<OrganizationBrand | null, ApiError>({
        queryKey: ['organization_brand'],
        queryFn: getOrganizationBrand,
    });

const updateOrganizationBrand = async (data: UpdateOrganizationBrandRequest) =>
    lightdashApi<OrganizationBrand | null>({
        url: `/org/brand`,
        method: 'POST',
        body: JSON.stringify(data),
    });

export const useOrganizationBrandUpdateMutation = () => {
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    return useMutation<
        OrganizationBrand | null,
        ApiError,
        UpdateOrganizationBrandRequest
    >(updateOrganizationBrand, {
        mutationKey: ['organization_brand_update'],
        onSuccess: (brand) => {
            queryClient.setQueryData(['organization_brand'], brand);
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to fetch brand',
                apiError: error,
            });
        },
    });
};
