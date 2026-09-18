import { ActionIcon, Tooltip } from '@mantine/core';
import { IconDatabase, IconDatabasePlus } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

export const SampleDataButton: FC<{
    enabled: boolean;
    onToggle: () => void;
    disabled?: boolean;
}> = ({ enabled, onToggle, disabled }) => (
    <Tooltip
        label={
            enabled
                ? 'Sample data included for the next build. Click to remove.'
                : 'Share up to 10 rows from the current results with the coding agent for the next build.'
        }
        multiline
        w={260}
        position="top"
    >
        <ActionIcon
            variant={enabled ? 'light' : 'subtle'}
            color={enabled ? 'indigo' : 'gray'}
            size="md"
            radius="xl"
            onClick={onToggle}
            disabled={disabled}
            aria-label="Include sample data"
            aria-pressed={enabled}
        >
            <MantineIcon
                icon={enabled ? IconDatabase : IconDatabasePlus}
                size={16}
            />
        </ActionIcon>
    </Tooltip>
);
