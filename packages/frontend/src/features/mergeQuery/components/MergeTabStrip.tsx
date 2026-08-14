import { FeatureFlags } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Menu,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { IconDots, IconGitMerge, IconX } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useExplore } from '../../../hooks/useExplore';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { selectTableName, useExplorerSelector } from '../../explorer/store';
import { useMergeSafe } from '../context/useMerge';
import styles from './MergeTabStrip.module.css';

export const MergeQueryOptions: FC = () => {
    const { data: mergeFlag } = useServerFeatureFlag(FeatureFlags.MergeQueries);
    const merge = useMergeSafe();

    if (
        !merge ||
        mergeFlag?.enabled !== true ||
        merge.isMerging ||
        merge.readOnly
    ) {
        return null;
    }

    return (
        <Menu position="bottom-end" withinPortal shadow="subtle">
            <Menu.Target>
                <Tooltip label="Query options" withinPortal>
                    <ActionIcon
                        className={styles.options}
                        variant="subtle"
                        color="gray"
                        size="sm"
                        aria-label="Query options"
                    >
                        <MantineIcon icon={IconDots} size={15} />
                    </ActionIcon>
                </Tooltip>
            </Menu.Target>
            <Menu.Dropdown>
                <Menu.Item
                    leftSection={<MantineIcon icon={IconGitMerge} size={14} />}
                    onClick={merge.addQuery}
                    data-testid="MergeTabStrip/AddQueryB"
                >
                    Merge another query
                </Menu.Item>
            </Menu.Dropdown>
        </Menu>
    );
};

/** Query tabs replace the solo explore header once merging starts. */
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

    if (
        !merge ||
        !tableName ||
        mergeFlag?.enabled !== true ||
        !merge.isMerging
    ) {
        return null;
    }

    const labelA = exploreA?.label ?? 'Query A';
    const labelB = exploreB?.label ?? 'Query B';
    const collide = labelA === labelB;

    return (
        <Box className={styles.tabs}>
            <UnstyledButton
                className={styles.tab}
                data-active={merge.focus === 'a'}
                onClick={() => merge.setFocus('a')}
            >
                <Box component="span" className={styles.dot} data-side="a" />
                <Text span size="sm" fw={600} truncate>
                    {collide ? `${labelA} (A)` : labelA}
                </Text>
            </UnstyledButton>

            <UnstyledButton
                className={styles.tab}
                data-active={merge.focus === 'b'}
                onClick={() => merge.setFocus('b')}
                data-testid="MergeTabStrip/QueryBTab"
            >
                <Box component="span" className={styles.dot} data-side="b" />
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
        </Box>
    );
};
