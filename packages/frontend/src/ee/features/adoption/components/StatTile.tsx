import { Paper, Stack, Text, Title } from '@mantine/core';
import { type FC } from 'react';

type Props = { label: string; value: string; detail: string };

export const StatTile: FC<Props> = ({ label, value, detail }) => (
    <Paper p="md">
        <Stack gap="xs">
            <Text fz="xs" c="dimmed" fw={500}>
                {label}
            </Text>
            <Title order={1}>{value}</Title>
            <Text fz="xs" c="dimmed">
                {detail}
            </Text>
        </Stack>
    </Paper>
);
