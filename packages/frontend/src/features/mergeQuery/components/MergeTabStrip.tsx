import { FeatureFlags } from '@lightdash/common';
import { Box, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { IconPlus, IconX } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useExplore } from '../../../hooks/useExplore';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { selectTableName, useExplorerSelector } from '../../explorer/store';
import { useMergeSafe } from '../context/useMerge';
import styles from './MergeTabStrip.module.css';

/**
 * The merge entry point: a row of real tabs above the sidebar's field tree.
 *
 * Solo, the row is the current query's tab and a quiet "+ Add query" tab —
 * the affordance is structural, not a floating button. With a second query
 * the row becomes two tabs that swap the field tree between the queries, and
 * the add tab disappears, because a merge joins exactly two.
 */
export const MergeTabStrip: FC = () => {
    const { data: mergeFlag } = useServerFeatureFlag(FeatureFlags.MergeQueries);
    const tableName = useExplorerSelector(selectTableName);
    const merge = useMergeSafe();
    const { data: exploreA } = useExplore(tableName, {
        refetchOnMount: false,
    });
    const { data: exploreB } = useExplore(
        merge?.queryB.exploreName ?? undefined,
        { refetchOnMount: false },
    );

    if (!merge || !tableName || mergeFlag?.enabled !== true) return null;
    if (!merge.isMerging && merge.readOnly) return null;

    const labelA = exploreA?.label ?? 'Query A';
    const labelB = exploreB?.label ?? 'Query B';
    const collide = merge.isMerging && labelA === labelB;

    return (
        <Box className={styles.tabs}>
            <UnstyledButton
                className={styles.tab}
                data-active={!merge.isMerging || merge.focus === 'a'}
                onClick={() => {
                    if (merge.isMerging) merge.setFocus('a');
                }}
            >
                <Box component="span" className={styles.dot} data-side="a" />
                <Text span size="sm" fw={600} truncate>
                    {collide ? `${labelA} (A)` : labelA}
                </Text>
            </UnstyledButton>

            {merge.isMerging ? (
                <UnstyledButton
                    className={styles.tab}
                    data-active={merge.focus === 'b'}
                    onClick={() => merge.setFocus('b')}
                    data-testid="MergeTabStrip/QueryBTab"
                >
                    <Box
                        component="span"
                        className={styles.dot}
                        data-side="b"
                    />
                    <Text span size="sm" fw={600} truncate>
                        {collide ? `${labelB} (B)` : labelB}
                    </Text>
                    {!merge.readOnly && (
                        <Tooltip label="Remove this query" withinPortal>
                            <Box
                                component="span"
                                className={styles.close}
                                role="button"
                                tabIndex={0}
                                aria-label="Remove this query"
                                data-testid="MergeTabStrip/RemoveQueryB"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    merge.removeQuery();
                                }}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        event.stopPropagation();
                                        merge.removeQuery();
                                    }
                                }}
                            >
                                <MantineIcon icon={IconX} size={12} />
                            </Box>
                        </Tooltip>
                    )}
                </UnstyledButton>
            ) : (
                <UnstyledButton
                    className={`${styles.tab} ${styles.add}`}
                    onClick={merge.addQuery}
                    data-testid="MergeTabStrip/AddQueryB"
                >
                    <MantineIcon icon={IconPlus} size={13} />
                    <Text span size="sm">
                        Add query
                    </Text>
                </UnstyledButton>
            )}
        </Box>
    );
};
