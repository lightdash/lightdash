import { Group, Paper, Stack, Text } from '@mantine-8/core';
import { IconMessageX } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';

type Props = {
    popoverOpened: boolean;
    humanFeedback?: string | null;
    humanScore?: number | null;
};

export const AssistantBubbleFeedbackControls: FC<Props> = ({
    popoverOpened,
    humanFeedback,
    humanScore,
}) => {
    if (!(popoverOpened && humanScore === -1 && humanFeedback)) {
        return null;
    }

    return (
        <Paper p="xs" mt="xs" radius="md" withBorder>
            <Stack gap="xs">
                <Group gap="xs">
                    <MantineIcon icon={IconMessageX} size={16} color="gray.7" />
                    <Text size="xs" c="dimmed" fw={600}>
                        User feedback
                    </Text>
                </Group>
                <Text size="sm" c="dimmed" fw={500}>
                    {humanFeedback}
                </Text>
            </Stack>
        </Paper>
    );
};
