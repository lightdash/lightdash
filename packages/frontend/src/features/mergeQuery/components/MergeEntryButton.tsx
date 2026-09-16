import { Button, Tooltip } from '@mantine/core';
import { IconGitMerge } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

/**
 * The visible way into a merge, beside the explore name. The kebab item
 * stays for menu and keyboard users; this is the affordance people find.
 */
export const MergeEntryButton: FC<{ onClick: () => void }> = ({ onClick }) => (
    <Tooltip
        label="Join this query with another explore's results on a shared field"
        position="bottom"
        withArrow
    >
        <Button
            variant="light"
            size="compact-xs"
            leftSection={<MantineIcon icon={IconGitMerge} size="sm" />}
            onClick={onClick}
        >
            Merge
        </Button>
    </Tooltip>
);
