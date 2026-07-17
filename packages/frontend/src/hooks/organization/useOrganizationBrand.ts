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

/**
 * Speculatively detects a brand for a domain during onboarding. A read despite
 * the POST verb (the endpoint fetches without persisting), so it lives in a
 * query: results survive StrictMode observer churn and failures stay silent.
 */
export const useDetectOrganizationBrand = (domain: string, enabled: boolean) =>
    useQuery<OrganizationBrand, ApiError>({
        queryKey: ['organization_brand_detect', domain],
        queryFn: () => fetchOrganizationBrand({ domain }),
        enabled: enabled && domain.length > 0,
        retry: false,
        retryOnMount: false,
        staleTime: Infinity,
        refetchOnWindowFocus: false,
    });

const saveOrganizationBrand = async (data: SaveOrganizationBrandRequest) =>
    lightdashApi<OrganizationBrand | null>({
        url: `/org/brand`,
        method: 'PUT',
        body: JSON.stringify(data),
    });

/**
 * Persists the edited brand appearance and updates the cached brand.
 * Pass showSuccessToast: false where the flow itself confirms the save
 * (e.g. onboarding advances to the next step).
 */
export const useSaveOrganizationBrand = (
    options: { showSuccessToast: boolean } = { showSuccessToast: true },
) => {
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
            if (options.showSuccessToast) {
                showToastSuccess({ title: 'Brand appearance saved' });
            }
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to save brand',
                apiError: error,
            });
        },
    });
};
