import { SegmentedControl } from '@mantine/core';
import { type FC } from 'react';
import { useExplore } from '../../../hooks/useExplore';
import { selectTableName, useExplorerSelector } from '../../explorer/store';
import { useMergeSafe } from '../context/useMerge';

/**
 * Which query's filters the card is showing, switchable from the card itself
 * so a viewer is never stuck on whichever side was focused last — the merge
 * tokens are inert on a saved chart, but reading both sides' filters is not
 * an edit.
 */
export const MergeFilterSwitch: FC = () => {
    const merge = useMergeSafe();
    const tableName = useExplorerSelector(selectTableName);
    const { data: exploreA } = useExplore(tableName, {
        refetchOnMount: false,
    });
    const { data: exploreB } = useExplore(
        merge?.queryB.exploreName ?? undefined,
        { refetchOnMount: false },
    );

    if (!merge?.isMerging) return null;

    const labelA = exploreA?.label ?? 'Query A';
    const labelB = exploreB?.label ?? 'Query B';
    const collide = labelA === labelB;

    return (
        <SegmentedControl
            size="xs"
            radius="md"
            value={merge.focus}
            onChange={(value) => {
                if (value === 'a' || value === 'b') merge.setFocus(value);
            }}
            onClick={(event) => event.stopPropagation()}
            data={[
                { value: 'a', label: collide ? `${labelA} (A)` : labelA },
                { value: 'b', label: collide ? `${labelB} (B)` : labelB },
            ]}
        />
    );
};
