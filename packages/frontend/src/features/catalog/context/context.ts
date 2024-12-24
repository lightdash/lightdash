import { createContext } from 'react';
import { type CatalogContextValues } from './types';

const CatalogContext = createContext<CatalogContextValues | undefined>(
    undefined,
);

export default CatalogContext;
