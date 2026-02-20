import { type ApiError, type FavoriteItems } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../api';

const getFavorites = async (projectUuid: string) =>
    lightdashApi<FavoriteItems>({
        url: `/projects/${projectUuid}/favorites`,
        method: 'GET',
        body: undefined,
    });

export const useFavorites = (projectUuid: string | undefined) =>
    useQuery<FavoriteItems, ApiError>({
        queryKey: ['favorites', projectUuid],
        queryFn: () => getFavorites(projectUuid!),
        enabled: !!projectUuid,
    });
