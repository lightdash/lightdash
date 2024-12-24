import { useContext } from 'react';
import { ItemDetailContext } from './ItemDetailContext';

export const useItemDetail = () => {
    const ctx = useContext(ItemDetailContext);

    if (ctx == null) {
        throw new Error('useItemDetail must be used within ItemDetailProvider');
    }

    return ctx;
};
