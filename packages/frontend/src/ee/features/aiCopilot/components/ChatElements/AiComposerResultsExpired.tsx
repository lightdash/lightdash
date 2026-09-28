import { Center, Stack, Text } from '@mantine/core';
import { IconClockOff } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';

// Results expire, so a failed fetch is an empty state rather than an error card.
export const AiComposerResultsExpired: FC<{ headerContent: ReactNode }> = ({
    headerContent,
}) => (
    <Stack gap="md" h="100%" mih={300}>
        {headerContent}
        <Center flex={1}>
            <Stack gap="xs" align="center" justify="center">
                <MantineIcon icon={IconClockOff} color="gray" />
                <Text size="xs" c="dimmed" ta="center">
                    These results have expired — ask the agent to re-run this
                    query
                </Text>
            </Stack>
        </Center>
    </Stack>
);
