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
                <Text fz="xs" lh={1.4} c="dimmed">
                    Context cleared, starting fresh from{' '}
                    <Text span ff="monospace" fz="xs" c="gray.7">
                        v{fromVersion}
                    </Text>
                </Text>
                <Tooltip label="Show project history">
                    <ActionIcon
                        size="sm"
                        variant="default"
                        c="gray.7"
                        aria-label="Show project history"
                        onClick={onShowHistory}
                    >
                        <MantineIcon
                            icon={IconHistory}
                            size={13}
                            stroke={1.7}
                        />
                    </ActionIcon>
                </Tooltip>
            </Group>
        }
    />
);

export default ThreadDivider;
