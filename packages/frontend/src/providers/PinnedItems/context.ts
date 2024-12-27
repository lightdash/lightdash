import { createContext } from 'react';
import { type PinnedItemsContextType } from './types';

const PinnedItemsContext = createContext<PinnedItemsContextType | null>(null);

export default PinnedItemsContext;
