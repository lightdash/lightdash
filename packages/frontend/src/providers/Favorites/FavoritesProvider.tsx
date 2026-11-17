import React, { useMemo } from 'react';
import { useFavoriteToggle } from '../../hooks/favorites/useFavoriteToggle';
import FavoritesContext, { type FavoritesContextType } from './context';

type FavoritesProviderProps = {
    projectUuid: string | undefined;
};

export const FavoritesProvider: React.FC<
    React.PropsWithChildren<FavoritesProviderProps>
> = ({ projectUuid, children }) => {
    const { isFavorite, toggle } = useFavoriteToggle(projectUuid);

    const value: FavoritesContextType = useMemo(
        () => ({
            isFavorited: isFavorite,
            toggleFavorite: toggle,
        }),
        [isFavorite, toggle],
    );

    return (
        <FavoritesContext.Provider value={value}>
            {children}
        </FavoritesContext.Provider>
    );
};
