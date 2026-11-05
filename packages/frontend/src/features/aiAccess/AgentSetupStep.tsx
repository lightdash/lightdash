import { Box, Group, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { type ReactNode } from 'react';
import MantineIcon from '../../components/common/MantineIcon';

export const AgentSetupStep = ({
    number,
    title,
    done,
    action,
    children,
}: {
    number: number;
    title: string;
    done: boolean;
    action?: ReactNode;
    children?: ReactNode;
}) => (
    <Group align="flex-start" wrap="nowrap" gap="sm">
        <ThemeIcon
            radius="xl"
            color={done ? 'green' : 'gray'}
            variant="light"
            size="md"
            aria-label={done ? `Step ${number} done` : `Step ${number}`}
        >
            {done ? <MantineIcon icon={IconCheck} size="sm" /> : number}
        </ThemeIcon>
        <Stack gap="xs" flex={1} miw={0}>
            <Group justify="space-between">
                <Text size="sm" fw={600}>
                    {title}
                </Text>
                {action}
            </Group>
            <Box>{children}</Box>
        </Stack>
    </Group>
);
