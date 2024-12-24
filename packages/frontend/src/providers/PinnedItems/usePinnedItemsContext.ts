import { useContext } from 'react';
import PinnedItemsContext from './context';
import { type PinnedItemsContextType } from './types';

const usePinnedItemsContext = (): PinnedItemsContextType => {
    const context = useContext(PinnedItemsContext);
    if (!context) {
        throw new Error(
            'usePinnedItemsContext must be used within a PinnedItemsContext',
        );
    }
    return context;
};

export default usePinnedItemsContext;
