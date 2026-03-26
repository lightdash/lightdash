import { useCallback } from 'react';
import {
    explorerActions,
    selectPreAggCacheEnabled,
    useExplorerDispatch,
    useExplorerSelector,
} from '../features/explorer/store';

export const usePreAggregateCacheEnabled = (): [
    boolean,
    (value: boolean) => void,
] => {
    const dispatch = useExplorerDispatch();
    const enabled = useExplorerSelector(selectPreAggCacheEnabled);
    const setEnabled = useCallback(
        (value: boolean) =>
            dispatch(explorerActions.setPreAggCacheEnabled(value)),
        [dispatch],
    );
    return [enabled, setEnabled];
};
