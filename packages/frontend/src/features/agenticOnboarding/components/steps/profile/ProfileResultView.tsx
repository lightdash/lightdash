import { type ProfileResult } from '@lightdash/common';
import {
    Badge,
    Box,
    Button,
    Group,
    NumberFormatter,
    Stack,
    Table,
    Text,
    Title,
} from '@mantine-8/core';
import { IconArrowRight, IconCircleCheck } from '@tabler/icons-react';
import { type FC } from 'react';
import Callout from '../../../../../components/common/Callout';
import MantineIcon from '../../../../../components/common/MantineIcon';
import DemoHatch from '../../DemoHatch';
import StepPanel from '../StepPanel';

type ProfileResultViewProps = {
    result: ProfileResult;
    onContinue: () => void;
    onBackToConnect: () => void;
};

const REASSURANCE =
    'This is a starting point — everything can be renamed or refined later.';

const schemaName = (result: ProfileResult): string =>
    result.tables[0]?.schema ?? result.entities[0]?.schema ?? 'your warehouse';

const rowCountCell = (rowCount: number | null) =>
    rowCount === null ? (
        <Text size="sm" c="dimmed">
            —
        </Text>
    ) : (
        <Text size="sm">
            <NumberFormatter value={rowCount} thousandSeparator />
        </Text>
    );

const ProfileResultView: FC<ProfileResultViewProps> = ({
    result,
    onContinue,
    onBackToConnect,
}) => {
    const schema = schemaName(result);

    if (result.tables.length === 0) {
        return (
            <StepPanel title="Profile your data">
                <Stack gap="md">
                    <Callout variant="warning" title="No tables found">
                        We couldn't find any tables in schema {schema}. Try a
                        different schema, or explore the demo project while you
                        sort out access.
                    </Callout>
                    <Group justify="space-between">
                        <Button variant="subtle" onClick={onBackToConnect}>
                            Back to connect
                        </Button>
                    </Group>
                    <DemoHatch />
                </Stack>
            </StepPanel>
        );
    }

    return (
        <StepPanel title="Profile your data">
            <Stack gap="lg">
                <Callout
                    variant="success"
                    title={`Connected — profiling schema ${schema}`}
                    icon={<MantineIcon icon={IconCircleCheck} />}
                >
                    We sampled your tables to understand the shape of your data.
                </Callout>

                {result.truncated && (
                    <Callout
                        variant="info"
                        title="Showing the first 100 tables"
                    >
                        Your schema has more tables than we profile during
                        onboarding. You can model the rest later.
                    </Callout>
                )}

                <Stack gap="xs">
                    <Title order={5}>Tables</Title>
                    <Box style={{ overflowX: 'auto' }}>
                        <Table highlightOnHover>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Table</Table.Th>
                                    <Table.Th>Rows</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {result.tables.map((table) => (
                                    <Table.Tr
                                        key={`${table.schema}.${table.name}`}
                                    >
                                        <Table.Td>
                                            <Group gap="xs" wrap="nowrap">
                                                <Text size="sm" fw={500}>
                                                    {table.name}
                                                </Text>
                                                {table.tableType === 'view' && (
                                                    <Badge
                                                        size="xs"
                                                        variant="light"
                                                        color="gray"
                                                    >
                                                        view
                                                    </Badge>
                                                )}
                                            </Group>
                                        </Table.Td>
                                        <Table.Td>
                                            {rowCountCell(table.rowCount)}
                                        </Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Box>
                </Stack>

                {result.entities.length > 0 && (
                    <Stack gap="xs">
                        <Title order={5}>Entities</Title>
                        <Stack gap="sm">
                            {result.entities.map((entity) => (
                                <Box
                                    key={`${entity.schema}.${entity.tableName}`}
                                >
                                    <Text size="sm" fw={500}>
                                        {entity.label}
                                    </Text>
                                    <Text size="sm" c="dimmed">
                                        {entity.description}
                                    </Text>
                                </Box>
                            ))}
                        </Stack>
                    </Stack>
                )}

                {result.relationships.length > 0 && (
                    <Stack gap="xs">
                        <Title order={5}>Relationships</Title>
                        <Stack gap="xs">
                            {result.relationships.map((relationship) => (
                                <Group
                                    key={`${relationship.fromTable}.${relationship.fromColumn}-${relationship.toTable}.${relationship.toColumn}`}
                                    gap="xs"
                                    wrap="nowrap"
                                >
                                    <Text size="sm">
                                        {relationship.fromTable}.
                                        {relationship.fromColumn} →{' '}
                                        {relationship.toTable}.
                                        {relationship.toColumn}
                                    </Text>
                                    <Badge
                                        size="xs"
                                        variant={
                                            relationship.confidence === 'low'
                                                ? 'outline'
                                                : 'light'
                                        }
                                        color={
                                            relationship.confidence === 'low'
                                                ? 'yellow'
                                                : 'green'
                                        }
                                    >
                                        {relationship.confidence === 'low'
                                            ? 'low confidence'
                                            : 'high confidence'}
                                    </Badge>
                                </Group>
                            ))}
                        </Stack>
                    </Stack>
                )}

                <Text size="sm" c="dimmed">
                    {REASSURANCE}
                </Text>

                <Group justify="flex-end">
                    <Button
                        rightSection={<MantineIcon icon={IconArrowRight} />}
                        onClick={onContinue}
                    >
                        Build my semantic layer
                    </Button>
                </Group>
            </Stack>
        </StepPanel>
    );
};

export default ProfileResultView;
