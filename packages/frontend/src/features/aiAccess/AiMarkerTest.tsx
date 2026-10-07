import { Badge, Button, Stack, Table, Text } from '@mantine/core';
import InlineErrorState from '../../components/common/InlineErrorState';
import { useTestAiMarker } from './api';
export const AiMarkerTest = ({
    projectUuid,
    connection,
    disabled,
}: {
    projectUuid: string;
    connection: string | null;
    disabled: boolean;
}) => {
    const test = useTestAiMarker(projectUuid, connection);
    return (
        <Stack gap="sm">
            <Button
                w="fit-content"
                disabled={disabled}
                loading={test.isLoading}
                onClick={() => test.mutate(undefined)}
            >
                Test agent marker
            </Button>
            {test.isError && (
                <InlineErrorState
                    message="Could not test the agent marker."
                    onRetry={() => test.mutate(undefined)}
                />
            )}
            {test.data && (
                <Stack gap="xs">
                    <Badge
                        w="fit-content"
                        color={test.data.ok ? 'green' : 'red'}
                    >
                        {test.data.ok ? 'Passed' : 'Failed'}
                    </Badge>
                    <Text size="sm">{test.data.message}</Text>
                    <Table>
                        <Table.Tbody>
                            {Object.entries(test.data.observed).map(
                                ([key, value]) => (
                                    <Table.Tr key={key}>
                                        <Table.Th>{key}</Table.Th>
                                        <Table.Td>
                                            {value ?? 'Not set'}
                                        </Table.Td>
                                    </Table.Tr>
                                ),
                            )}
                        </Table.Tbody>
                    </Table>
                </Stack>
            )}
        </Stack>
    );
};
