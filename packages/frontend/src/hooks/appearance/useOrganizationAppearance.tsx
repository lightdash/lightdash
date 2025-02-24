import {
    type ApiError,
    type CreateColorPalette,
    type OrganizationColorPalette,
    type UpdateColorPalette,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';

const createColorPaletteApi = async (data: CreateColorPalette) =>
    lightdashApi<OrganizationColorPalette>({
        url: `/org/color-palettes`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const getColorPalettesApi = async () =>
    lightdashApi<OrganizationColorPalette[]>({
        url: `/org/color-palettes`,
        method: 'GET',
        body: undefined,
    });

const updateColorPaletteApi = async (
    colorPaletteUuid: string,
    data: UpdateColorPalette,
) =>
    lightdashApi<OrganizationColorPalette>({
        url: `/org/color-palettes/${colorPaletteUuid}`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

const deleteColorPaletteApi = async (colorPaletteUuid: string) =>
    lightdashApi<null>({
        url: `/org/color-palettes/${colorPaletteUuid}`,
        method: 'DELETE',
        body: undefined,
    });

const setDefaultColorPaletteApi = async (colorPaletteUuid: string) =>
    lightdashApi<OrganizationColorPalette>({
        url: `/org/color-palettes/${colorPaletteUuid}/default`,
        method: 'POST',
        body: undefined,
    });

export const useCreateColorPalette = () => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();

    return useMutation<OrganizationColorPalette, ApiError, CreateColorPalette>(
        (data) => createColorPaletteApi(data),
        {
            mutationKey: ['create_color_palette'],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['color_palettes']);
                showToastSuccess({
                    title: 'Color palette created successfully',
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to create color palette',
                    apiError: error,
                });
            },
        },
    );
};

export const useColorPalettes = () => {
    return useQuery<
        OrganizationColorPalette[],
        ApiError,
        OrganizationColorPalette[]
    >({
        queryKey: ['color_palettes'],
        queryFn: getColorPalettesApi,
        select: (data) =>
            data.sort((a, b) => Number(b.isDefault) - Number(a.isDefault)),
    });
};

export const useUpdateColorPalette = () => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();

    return useMutation<OrganizationColorPalette, ApiError, UpdateColorPalette>(
        (data) => updateColorPaletteApi(data.uuid, data),
        {
            mutationKey: ['update_color_palette'],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['color_palettes']);
                showToastSuccess({
                    title: 'Color palette updated successfully',
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to update color palette',
                    apiError: error,
                });
            },
        },
    );
};

export const useDeleteColorPalette = () => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();

    return useMutation<null, ApiError, string>(
        (colorPaletteUuid) => deleteColorPaletteApi(colorPaletteUuid),
        {
            mutationKey: ['delete_color_palette'],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['color_palettes']);
                showToastSuccess({
                    title: 'Color palette deleted successfully',
                });
            },
            onError: ({ error }, colorPaletteUuid) => {
                showToastApiError({
                    title: `Failed to delete color palette ${colorPaletteUuid}`,
                    apiError: error,
                });
            },
        },
    );
};

export const useSetDefaultColorPalette = () => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();

    return useMutation<OrganizationColorPalette, ApiError, string>(
        (colorPaletteUuid) => setDefaultColorPaletteApi(colorPaletteUuid),
        {
            mutationKey: ['set_default_color_palette'],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['color_palettes']);
                showToastSuccess({
                    title: 'Default color palette updated successfully',
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to set default color palette',
                    apiError: error,
                });
            },
        },
    );
};
