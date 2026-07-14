import {
    type ApiError,
    type OrganizationBrand,
    type SaveOrganizationBrandRequest,
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

const fetchOrganizationBrand = async (data: UpdateOrganizationBrandRequest) =>
    lightdashApi<OrganizationBrand>({
        url: `/org/brand/fetch`,
        method: 'POST',
        body: JSON.stringify(data),
    });

/**
 * Fetches a brand profile from a domain (via Brandfetch) without persisting it.
 * The caller decides what to do with the result (e.g. populate a form so the
 * user can review and edit before saving).
 */
export const useFetchOrganizationBrand = () => {
    const { showToastApiError } = useToaster();
    return useMutation<
        OrganizationBrand,
        ApiError,
        UpdateOrganizationBrandRequest
    >(fetchOrganizationBrand, {
        mutationKey: ['organization_brand_fetch'],
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to fetch brand',
                apiError: error,
            });
        },
    });
};

const saveOrganizationBrand = async (data: SaveOrganizationBrandRequest) =>
    lightdashApi<OrganizationBrand | null>({
        url: `/org/brand`,
        method: 'PUT',
        body: JSON.stringify(data),
    });

/**
 * Persists the edited brand appearance and updates the cached brand.
 */
export const useSaveOrganizationBrand = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<
        OrganizationBrand | null,
        ApiError,
        SaveOrganizationBrandRequest
    >(saveOrganizationBrand, {
        mutationKey: ['organization_brand_save'],
        onSuccess: (brand) => {
            queryClient.setQueryData(['organization_brand'], brand);
            showToastSuccess({ title: 'Brand appearance saved' });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to save brand',
                apiError: error,
            });
        },
    });
};
