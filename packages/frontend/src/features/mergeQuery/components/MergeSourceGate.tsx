import { isField, type ItemsMap } from '@lightdash/common';
import { type FC, type ReactNode } from 'react';
import { useMergeSafe } from '../context/useMerge';
import { useMergeSourceCell } from '../hooks/useMergeSourceCell';

type Props = { item: ItemsMap[string] | undefined; children: ReactNode };

const MergedSourceGate: FC<Props> = ({ item, children }) => {
    const { resolve } = useMergeSourceCell();
    return item && isField(item) && resolve(item, {}) ? children : null;
};

/** Renders source actions only for columns a merged source owns; always outside a merge. */
export const MergeSourceGate: FC<Props> = ({ item, children }) =>
    useMergeSafe()?.mergeResults ? (
        <MergedSourceGate item={item}>{children}</MergedSourceGate>
    ) : (
        children
    );
