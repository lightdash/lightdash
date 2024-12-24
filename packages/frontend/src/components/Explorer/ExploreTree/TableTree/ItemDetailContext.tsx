import { createContext } from 'react';
import { type ItemDetailProps } from './types';

export const ItemDetailContext = createContext<{
    showItemDetail: (detail: ItemDetailProps) => void;
    isItemDetailOpen: boolean;
} | null>(null);
