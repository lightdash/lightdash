import {
    FeatureFlags,
    ResourceViewItemType,
    type ApiError,
    type FavoriteItems,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../api';
import { useServerFeatureFlag } from '../useServerOrClientFeatureFlag';

const getFavorites = async (projectUuid: string) =>
    lightdashApi<FavoriteItems>({
        url: `/projects/${projectUuid}/favorites`,
        method: 'GET',
        body: undefined,
    });

export const useFavorites = (projectUuid: string | undefined) => {
    const documentsFlag = useServerFeatureFlag(FeatureFlags.Documents);
    const documentsEnabled =
        documentsFlag.data?.enabled === true && !documentsFlag.isError;
    return useQuery<FavoriteItems, ApiError>({
        queryKey: ['favorites', projectUuid],
        queryFn: () => getFavorites(projectUuid!),
        enabled: !!projectUuid,
        select: (items) =>
            items.filter(
                (item) =>
                    item.type !== ResourceViewItemType.DOCUMENT ||
                    documentsEnabled,
            ),
    });
};
