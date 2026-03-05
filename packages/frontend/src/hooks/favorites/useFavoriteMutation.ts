import {
    type ApiError,
    type ContentType,
    type ToggleFavoriteResponse,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';

const toggleFavorite = async (
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
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();

    return useMutation<
        ToggleFavoriteResponse,
        ApiError,
        { contentType: ContentType; contentUuid: string }
    >({
        mutationKey: ['favorite_toggle'],
        mutationFn: ({ contentType, contentUuid }) => {
            if (!projectUuid) {
                return Promise.reject(new Error('No project UUID'));
            }
            return toggleFavorite(projectUuid, contentType, contentUuid);
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
