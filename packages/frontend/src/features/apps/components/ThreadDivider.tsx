import { Divider, Group, Text } from '@mantine/core';
import { IconHistory } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

type Props = {
    /** The version the new thread iterates from. */
    fromVersion: number;
};

/** Marks where the agent context was cleared in the builder chat. */
const ThreadDivider: FC<Props> = ({ fromVersion }) => (
    <Divider
        my="md"
        labelPosition="center"
        label={
            <Group gap={6} wrap="nowrap">
                <MantineIcon
                    icon={IconHistory}
                    size={13}
                    stroke={1.7}
                    color="gray.6"
                />
                <Text fz="xs" lh={1.4} c="dimmed">
                    Context cleared, starting fresh from{' '}
                    <Text span ff="monospace" fz="xs" c="gray.7">
                        v{fromVersion}
                    </Text>
                </Text>
            </Group>
        }
    />
);

export default ThreadDivider;
