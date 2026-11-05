import { type ApiError, type FavoriteItems } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { type LightdashApi } from '../../api';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';

const getFavorites = async (lightdashApi: LightdashApi, projectUuid: string) =>
    lightdashApi<FavoriteItems>({
        url: `/projects/${projectUuid}/favorites`,
        method: 'GET',
        body: undefined,
    });

export const useFavorites = (projectUuid: string | undefined) => {
    const lightdashApi = useLightdashApi();
    return useQuery<FavoriteItems, ApiError>({
        queryKey: ['favorites', projectUuid],
        queryFn: () => getFavorites(lightdashApi, projectUuid!),
        enabled: !!projectUuid,
    });
};
