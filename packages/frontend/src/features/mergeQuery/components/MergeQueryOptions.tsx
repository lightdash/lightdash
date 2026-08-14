import { FeatureFlags } from '@lightdash/common';
import { ActionIcon, Menu, Tooltip } from '@mantine/core';
import { IconDots, IconGitMerge } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { selectMetricQuery, useExplorerSelector } from '../../explorer/store';
import { DEFAULT_ADDITIONAL_SOURCE_ID, PRIMARY_SOURCE_ID } from '../constants';
import { useMergeSafe } from '../context/useMerge';
import { isMergeSourceReady } from '../utils/mergeWorkflow';

/** Keeps the advanced merge entry point available without adding solo-query chrome. */
export const MergeQueryOptions: FC = () => {
    const { data: mergeFlag } = useServerFeatureFlag(FeatureFlags.MergeQueries);
    const metricQuery = useExplorerSelector(selectMetricQuery);
    const merge = useMergeSafe();

    if (
        !merge ||
        merge.isMerging ||
        merge.readOnly ||
        mergeFlag?.enabled !== true
    ) {
        return null;
    }

    const primarySourceReady = isMergeSourceReady(metricQuery);

    return (
        <Menu position="bottom-end" withinPortal shadow="subtle">
            <Menu.Target>
                <Tooltip label="Query options" withinPortal>
                    <ActionIcon
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
                    onClick={() =>
                        merge.addSource(DEFAULT_ADDITIONAL_SOURCE_ID, {
                            kind: 'source',
                            sourceId: primarySourceReady
                                ? DEFAULT_ADDITIONAL_SOURCE_ID
                                : PRIMARY_SOURCE_ID,
                        })
                    }
                    data-testid="MergeQueryOptions/AddSource"
                >
                    Merge another query
                </Menu.Item>
            </Menu.Dropdown>
        </Menu>
    );
};
