import { type ContentType } from '@lightdash/common';
import React, { useCallback, useMemo } from 'react';
import { useFavoriteMutation } from '../../hooks/favorites/useFavoriteMutation';
import { useFavorites } from '../../hooks/favorites/useFavorites';
import FavoritesContext, { type FavoritesContextType } from './context';

type FavoritesProviderProps = {
    projectUuid: string | undefined;
};

export const FavoritesProvider: React.FC<
    React.PropsWithChildren<FavoritesProviderProps>
> = ({ projectUuid, children }) => {
    const { data: favorites } = useFavorites(projectUuid);
    const { mutate } = useFavoriteMutation(projectUuid);

    const favoriteUuids = useMemo(() => {
        const set = new Set<string>();
        if (favorites) {
            for (const item of favorites) {
                set.add(item.data.uuid);
            }
        }
        return set;
    }, [favorites]);

    const isFavorited = useCallback(
        (uuid: string) => favoriteUuids.has(uuid),
        [favoriteUuids],
    );

    const toggleFavorite = useCallback(
        (contentType: ContentType, contentUuid: string) => {
            mutate({ contentType, contentUuid });
        },
        [mutate],
    );

    const value: FavoritesContextType = useMemo(
        () => ({
            isFavorited,
            toggleFavorite,
        }),
        [isFavorited, toggleFavorite],
    );

    return (
        <FavoritesContext.Provider value={value}>
            {children}
        </FavoritesContext.Provider>
    );
};
