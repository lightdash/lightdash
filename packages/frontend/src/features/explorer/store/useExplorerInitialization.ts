import { useEffect, useRef } from 'react';
import { type ExplorerReduceState } from '../../../providers/Explorer/types';
import { explorerActions } from './explorerSlice';
import { useExplorerDispatch } from './hooks';

/**
 * Hook to initialize Redux store with ExplorerProvider's initial state
 * Should be called in pages that use ExplorerProvider to sync data
 */
export const useExplorerInitialization = (
    initialState?: ExplorerReduceState,
) => {
    const dispatch = useExplorerDispatch();
    const hasInitialized = useRef(false);

    useEffect(() => {
        // Only initialize once when component mounts with data
        if (initialState && !hasInitialized.current) {
            dispatch(explorerActions.reset(initialState));
            hasInitialized.current = true;
        }
    }, [initialState, dispatch]);

    return hasInitialized.current;
};
