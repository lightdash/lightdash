import { AiAgentMarkerLevel, type AiAgentMarker } from '@lightdash/common';
import { Badge, Paper, Stack, Table, Text } from '@mantine/core';
import CodeBlock from '../../components/common/CodeBlock/CodeBlock';
const markerLabels: Record<AiAgentMarkerLevel, string> = {
    [AiAgentMarkerLevel.VERIFIED_SESSION]: 'Enforced by warehouse',
    [AiAgentMarkerLevel.ADVISORY_SESSION]: 'Session can change it',
    [AiAgentMarkerLevel.IDENTIFY_ONLY]: 'Visible in query history',
    [AiAgentMarkerLevel.NONE]: 'No marker',
};
export const AiWarehouseSignals = ({ marker }: { marker: AiAgentMarker }) =>
    marker.level === AiAgentMarkerLevel.NONE ? (
        <Paper variant="dotted" p="md">
            <Text size="sm" c="dimmed">
                This warehouse cannot mark agent queries. Use a separate
                principal to keep agent access apart.
            </Text>
        </Paper>
    ) : (
        <Stack gap="sm">
            <Badge w="fit-content" color="gray">
                {markerLabels[marker.level]}
            </Badge>
            <Table>
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>Signal</Table.Th>
                        <Table.Th>Where to read it</Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {marker.signals.map((signal) => (
                        <Table.Tr key={signal.name}>
                            <Table.Td>{signal.name}</Table.Td>
                            <Table.Td>{signal.where}</Table.Td>
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>
            {marker.note && (
                <Text size="sm" c="dimmed">
                    {marker.note}
                </Text>
            )}
            {marker.enforce !== null && (
                <Stack gap="xs">
                    <Text size="sm" fw={500}>
                        Example warehouse policy
                    </Text>
                    <CodeBlock
                        code={marker.enforce}
                        language="sql"
                        copyLabel="Copy example policy"
                    />
                </Stack>
            )}
        </Stack>
    );
