import { useContext } from 'react';
import { Context, PinnedItemsContext } from '.';

export const usePinnedItemsContext = (): PinnedItemsContext => {
    const context = useContext(Context);
    if (!context) {
        throw new Error(
            'usePinnedItemsContext must be used within a PinnedItemsContext',
        );
    }
    return context;
};
