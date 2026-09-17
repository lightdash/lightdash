import { ActionIcon, Divider, Group, Text, Tooltip } from '@mantine/core';
import { IconHistory } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

type Props = {
    /** The version the new thread iterates from. */
    fromVersion: number;
    onShowHistory: () => void;
};

/** Marks where the agent context was cleared in the builder chat. */
const ThreadDivider: FC<Props> = ({ fromVersion, onShowHistory }) => (
    <Divider
        my="md"
        labelPosition="center"
        label={
            <Group gap="xs" wrap="nowrap">
                <Text fz="sm" c="dimmed">
                    Context cleared, starting fresh from v{fromVersion}
                </Text>
                <Tooltip label="Show project history">
                    <ActionIcon
                        size="sm"
                        variant="default"
                        aria-label="Show project history"
                        onClick={onShowHistory}
                    >
                        <MantineIcon icon={IconHistory} size={14} />
                    </ActionIcon>
                </Tooltip>
            </Group>
        }
    />
);

// ts-unused-exports:disable-next-line
export default ThreadDivider;
