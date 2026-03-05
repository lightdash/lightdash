import { useContext } from 'react';
import FavoritesContext, { type FavoritesContextType } from './context';

const useFavoritesContext = (): FavoritesContextType | null => {
    return useContext(FavoritesContext);
};

export default useFavoritesContext;
