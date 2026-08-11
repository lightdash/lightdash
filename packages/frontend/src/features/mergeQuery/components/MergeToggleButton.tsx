import { FeatureFlags } from '@lightdash/common';
import { Button, Tooltip } from '@mantine/core';
import { IconArrowMerge } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { useExplorerSelector } from '../../explorer/store';
import { selectTableName } from '../../explorer/store';
import { useMergeSafe } from '../context/useMerge';

/**
 * Starts a merge, next to the control that runs one.
 *
 * Adding a second query is a thing you do to the query you are about to run,
 * so it belongs beside Run rather than in a strip of its own further down the
 * page — where it read as a section of the results rather than an action.
 */
export const MergeToggleButton: FC = () => {
    const { data: mergeFlag } = useServerFeatureFlag(FeatureFlags.MergeQueries);
    const tableName = useExplorerSelector(selectTableName);
    const merge = useMergeSafe();

    if (!merge || !tableName || mergeFlag?.enabled !== true) return null;

    return (
        <Tooltip
            label={
                merge.isMerging
                    ? 'Close the merge setup'
                    : 'Merge this query with another'
            }
            position="bottom"
            withinPortal
        >
            <Button
                size="xs"
                variant={merge.isMerging ? 'light' : 'default'}
                leftSection={<MantineIcon icon={IconArrowMerge} />}
                onClick={merge.isMerging ? merge.removeQuery : merge.addQuery}
            >
                Merge
            </Button>
        </Tooltip>
    );
};
