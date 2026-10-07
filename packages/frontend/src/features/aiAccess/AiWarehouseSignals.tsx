import { type AiAgentMarker } from '@lightdash/common';
import { Code, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { CopyActionIcon } from '../../components/common/CopyActionIcon';

export const AiWarehouseSignals = ({
    marker,
    separate,
}: {
    marker: AiAgentMarker;
    separate: boolean;
}) => (
    <Paper withBorder p="md">
        <Stack gap="sm">
            <Title order={4}>In the warehouse</Title>
            {separate && (
                <Text size="sm">
                    Use the separate principal's grants to control access. Its
                    queries also carry the agent marker.
                </Text>
            )}
            <Text size="sm">{marker.identify}</Text>
            <Text size="sm">
                Enforcement happens in the warehouse using these signals.
            </Text>
            {marker.enforce !== null && (
                <Stack gap="xs">
                    <Group justify="space-between">
                        <Text size="sm" fw={500}>
                            Example warehouse policy
                        </Text>
                        <CopyActionIcon value={marker.enforce} />
                    </Group>
                    <Code block>{marker.enforce}</Code>
                </Stack>
            )}
        </Stack>
    </Paper>
);
