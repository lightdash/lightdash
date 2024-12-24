import { useContext } from 'react';
import CatalogContext from './context';

export const useCatalogContext = () => {
    const context = useContext(CatalogContext);
    if (!context) {
        throw new Error(
            'useCatalogContext must be used within a CatalogProvider',
        );
    }
    return context;
};
