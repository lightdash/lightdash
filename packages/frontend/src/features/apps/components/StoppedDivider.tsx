import { Divider, Group, Text } from '@mantine/core';
import { IconHandStop } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

/** Marks a build the user stopped in the builder chat. */
const StoppedDivider: FC = () => (
    <Divider
        my="md"
        labelPosition="center"
        role="status"
        label={
            <Group gap={6} wrap="nowrap">
                <MantineIcon
                    icon={IconHandStop}
                    size={13}
                    stroke={1.7}
                    color="dimmed"
                />
                <Text fz="xs" lh={1.4} c="dimmed">
                    Build stopped
                </Text>
            </Group>
        }
    />
);

export default StoppedDivider;
