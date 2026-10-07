import { AiAgentMarkerLevel, type AiAgentMarker } from '@lightdash/common';
import { Badge, Code, Group, List, Stack, Text, Title } from '@mantine/core';
import { CopyActionIcon } from '../../components/common/CopyActionIcon';

const markerLabels: Record<AiAgentMarkerLevel, string> = {
    [AiAgentMarkerLevel.VERIFIED_SESSION]: 'Verified session',
    [AiAgentMarkerLevel.ADVISORY_SESSION]: 'Advisory session',
    [AiAgentMarkerLevel.IDENTIFY_ONLY]: 'Identify only',
    [AiAgentMarkerLevel.NONE]: 'Not available',
};

export const AiAgentMarkerSection = ({ marker }: { marker: AiAgentMarker }) => (
    <Stack gap="sm">
        <Group>
            <Title order={4}>Agent marker</Title>
            <Badge>{markerLabels[marker.level]}</Badge>
        </Group>
        <Text size="sm">
            Enforcement is done in the warehouse using these signals.
        </Text>
        <List size="sm">
            {marker.channels.map((channel) => (
                <List.Item key={channel}>{channel}</List.Item>
            ))}
        </List>
        <Text size="sm">{marker.identify}</Text>
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
);
