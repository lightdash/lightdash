import { type ContentType } from '@lightdash/common';
import { createContext } from 'react';

export type FavoritesContextType = {
    isFavorited: (uuid: string) => boolean;
    toggleFavorite: (contentType: ContentType, contentUuid: string) => void;
};

const FavoritesContext = createContext<FavoritesContextType | null>(null);

export default FavoritesContext;
