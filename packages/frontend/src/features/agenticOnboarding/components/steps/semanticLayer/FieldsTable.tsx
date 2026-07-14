import {
    type SemanticLayerDimension,
    type SemanticLayerMetric,
} from '@lightdash/common';
import { Badge, Box, Group, Switch, Table, Text } from '@mantine-8/core';
import { type FC } from 'react';
import InlineEditableLabel from './InlineEditableLabel';

export type EditableField = SemanticLayerMetric | SemanticLayerDimension;

type FieldsTableProps = {
    caption: string;
    fields: EditableField[];
    onRename: (field: EditableField, label: string) => void;
    onToggleHidden: (field: EditableField, hidden: boolean) => void;
    disabled: boolean;
};

const FieldsTable: FC<FieldsTableProps> = ({
    caption,
    fields,
    onRename,
    onToggleHidden,
    disabled,
}) => {
    if (fields.length === 0) {
        return (
            <Text size="sm" c="dimmed">
                No {caption.toLowerCase()} generated.
            </Text>
        );
    }

    return (
        <Box style={{ overflowX: 'auto' }}>
            <Table>
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>{caption}</Table.Th>
                        <Table.Th>Type</Table.Th>
                        <Table.Th>Source</Table.Th>
                        <Table.Th>Visible</Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {fields.map((field) => (
                        <Table.Tr key={field.fieldId}>
                            <Table.Td>
                                <Group gap={2} wrap="nowrap">
                                    <InlineEditableLabel
                                        value={field.label}
                                        ariaLabel={`${field.name} label`}
                                        disabled={disabled}
                                        onCommit={(label) =>
                                            onRename(field, label)
                                        }
                                    />
                                </Group>
                            </Table.Td>
                            <Table.Td>
                                <Badge
                                    size="xs"
                                    variant="light"
                                    color="indigo"
                                    tt="none"
                                >
                                    {field.type}
                                </Badge>
                            </Table.Td>
                            <Table.Td>
                                <Text size="xs" c="dimmed">
                                    {field.source.table}.{field.source.column}
                                </Text>
                            </Table.Td>
                            <Table.Td>
                                <Switch
                                    size="sm"
                                    aria-label={`Show ${field.label}`}
                                    checked={!field.hidden}
                                    disabled={disabled}
                                    onChange={(event) =>
                                        onToggleHidden(
                                            field,
                                            !event.currentTarget.checked,
                                        )
                                    }
                                />
                            </Table.Td>
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>
        </Box>
    );
};

export default FieldsTable;
