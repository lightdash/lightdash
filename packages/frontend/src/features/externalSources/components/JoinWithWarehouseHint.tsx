import { Button } from '@mantine/core';
import { IconGitMerge } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

/**
 * The discoverable path from an uploaded table to a cross-source join: one
 * quiet button under the explore header that opens the merge flow with this
 * table as the primary source.
 */
export const JoinWithWarehouseHint: FC<{ onClick: () => void }> = ({
    onClick,
}) => (
    <Button
        variant="light"
        size="compact-xs"
        leftSection={<MantineIcon icon={IconGitMerge} size="sm" />}
        onClick={onClick}
    >
        Join with your warehouse data
    </Button>
);
