import { Paper, Text } from '@mantine-8/core';
import { type FC } from 'react';

export const SchedulerSectionPlaceholder: FC<{ label: string }> = ({
    label,
}) => (
    <Paper withBorder radius="md" p="xl" bg="var(--mantine-color-default)">
        <Text size="sm" c="dimmed">
            {label} settings land here in the next step.
        </Text>
    </Paper>
);
