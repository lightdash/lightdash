import {
    type ApiError,
    type ContentType,
    type ToggleFavoriteResponse,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';

export type FavoriteMutationVariables = {
    contentType: ContentType;
    contentUuid: string;
};

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
    const { t } = useTranslation('app');
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
            return toggleFavorite(projectUuid, contentType, contentUuid);
        },
        onSuccess: async (data) => {
            await queryClient.invalidateQueries(['favorites', projectUuid]);
            showToastSuccess({
                title: data.isFavorite
                    ? t('useFavoriteMutation.added')
                    : t('useFavoriteMutation.removed'),
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: t('useFavoriteMutation.couldNotUpdateFavorite'),
                apiError: error,
            });
        },
    });
};
