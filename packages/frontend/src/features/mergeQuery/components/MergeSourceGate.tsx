import { type ItemsMap } from '@lightdash/common';
import { type FC, type ReactNode } from 'react';
import { useIsOwnedByMergeSource } from '../hooks/useIsOwnedByMergeSource';

/** Renders source actions only for columns a merged source owns. */
export const MergeSourceGate: FC<{
    item: ItemsMap[string] | undefined;
    children: ReactNode;
}> = ({ item, children }) =>
    useIsOwnedByMergeSource()(item) ? children : null;
