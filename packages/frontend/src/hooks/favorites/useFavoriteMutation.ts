import {
    type ApiError,
    type ContentType,
    type ToggleFavoriteResponse,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../../api';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import useToaster from '../toaster/useToaster';

export type FavoriteMutationVariables = {
    contentType: ContentType;
    contentUuid: string;
};

const toggleFavorite = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    contentType: ContentType,
    contentUuid: string,
) =>
    lightdashApi<ToggleFavoriteResponse>({
        url: `/projects/${projectUuid}/favorites`,
        method: 'PATCH',
        body: JSON.stringify({ contentType, contentUuid }),
    });

export const useFavoriteMutation = (projectUuid: string | undefined) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();

    return useMutation<
        ToggleFavoriteResponse,
        ApiError,
        FavoriteMutationVariables
    >({
        mutationKey: ['favorite_toggle', projectUuid],
        mutationFn: ({ contentType, contentUuid }) => {
            if (!projectUuid) {
                return Promise.reject(new Error('No project UUID'));
            }
            return toggleFavorite(
                lightdashApi,
                projectUuid,
                contentType,
                contentUuid,
            );
        },
        onSuccess: async (data) => {
            await queryClient.invalidateQueries(['favorites', projectUuid]);
            showToastSuccess({
                title: data.isFavorite
                    ? 'Added to favorites'
                    : 'Removed from favorites',
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Could not update favorite',
                apiError: error,
            });
        },
    });
};
