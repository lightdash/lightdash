import { Paper, Stack, Text, Title } from '@mantine/core';
import { useId, type FC } from 'react';

type Props = { label: string; value: string; detail: string };

// A labelled group, so assistive technology reads the caption with its figure
export const StatTile: FC<Props> = ({ label, value, detail }) => {
    const labelId = useId();
    return (
        <Paper p="md" role="group" aria-labelledby={labelId}>
            <Stack gap="xs">
                <Text id={labelId} fz="xs" c="dimmed" fw={500}>
                    {label}
                </Text>
                <Title order={1}>{value}</Title>
                <Text fz="xs" c="dimmed">
                    {detail}
                </Text>
            </Stack>
        </Paper>
    );
};
