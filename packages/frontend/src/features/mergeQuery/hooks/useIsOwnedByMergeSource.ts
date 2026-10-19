import { isField, type ItemsMap } from '@lightdash/common';
import { useCallback } from 'react';
import { useMergeSafe } from '../context/useMerge';
import { useMergeSourceCell } from './useMergeSourceCell';

/** Whether a merged source owns the column; always true outside a merge. */
export const useIsOwnedByMergeSource = () => {
    const isMerged = !!useMergeSafe()?.mergeResults;
    const { resolve } = useMergeSourceCell();
    return useCallback(
        (item: ItemsMap[string] | undefined) =>
            !isMerged ||
            (!!item && isField(item) && resolve(item, {}) !== null),
        [isMerged, resolve],
    );
};
