import { Button, Divider, Group, Text } from '@mantine/core';
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
                <Text fz="xs" c="dimmed">
                    context cleared, the agent starts fresh from version{' '}
                    {fromVersion}
                </Text>
                <Button
                    size="compact-xs"
                    variant="subtle"
                    leftSection={<MantineIcon icon={IconHistory} size={14} />}
                    onClick={onShowHistory}
                >
                    Show project history
                </Button>
            </Group>
        }
    />
);

// ts-unused-exports:disable-next-line
export default ThreadDivider;
