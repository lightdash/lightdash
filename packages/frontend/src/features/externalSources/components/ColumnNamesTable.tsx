import { friendlyName, type ResultColumn } from '@lightdash/common';
import { Stack, Table, Text, TextInput } from '@mantine/core';
import { type GetInputPropsReturnType } from '@mantine/form';
import { type FC } from 'react';

type Props = {
    columns: ResultColumn[];
    getInputProps: (reference: string) => GetInputPropsReturnType;
};

export const ColumnNamesTable: FC<Props> = ({ columns, getInputProps }) => (
    <Stack gap="xs">
        <Text fz="sm" fw={500}>
            Columns · {columns.length}
        </Text>
        <Table verticalSpacing={4} horizontalSpacing="sm">
            <Table.Tbody>
                {columns.map((column) => (
                    <Table.Tr key={column.reference}>
                        <Table.Td>
                            <TextInput
                                size="xs"
                                aria-label={`Name for ${column.reference}`}
                                placeholder={friendlyName(column.reference)}
                                {...getInputProps(column.reference)}
                            />
                        </Table.Td>
                        <Table.Td w={160}>
                            <Text fz="xs" c="dimmed" truncate>
                                {column.reference}
                            </Text>
                        </Table.Td>
                        <Table.Td w={80}>
                            <Text fz="xs" c="dimmed">
                                {column.type}
                            </Text>
                        </Table.Td>
                    </Table.Tr>
                ))}
            </Table.Tbody>
        </Table>
    </Stack>
);
