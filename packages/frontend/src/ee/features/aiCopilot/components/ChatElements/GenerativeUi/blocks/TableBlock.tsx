import { type GenerativeUiLeafBlock } from '@lightdash/common';
import {
    Box,
    Checkbox,
    Group,
    Input,
    Loader,
    Paper,
    Radio,
    Stack,
    Table,
    Text,
} from '@mantine/core';
import { type FC } from 'react';
import { readPath, resolveRows } from '../bindings';
import { queryNoticeOf, type GenerativeUiRenderContext } from './renderContext';
import classes from './TableBlock.module.css';

type GenerativeUiTableBlock = Extract<GenerativeUiLeafBlock, { type: 'table' }>;

type RowId = string | number;

// Cells are plain text: nested values print as compact JSON.
const cellText = (value: unknown): string => {
    if (value === undefined || value === null || value === '') return '—';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    return JSON.stringify(value);
};

const rowIdOf = (
    row: Record<string, unknown>,
    rowKey: string,
): RowId | null => {
    const value = readPath(row, rowKey);
    return typeof value === 'string' || typeof value === 'number'
        ? value
        : null;
};

/** Read-only rows from a query or from the spec, with optional selection. */
export const TableBlock: FC<{
    block: GenerativeUiTableBlock;
    context: GenerativeUiRenderContext;
}> = ({ block, context }) => {
    const { columns, selectable } = block;
    const resolved = resolveRows(block.rows, context.loadedQueries);
    const notice = Array.isArray(block.rows)
        ? null
        : queryNoticeOf(block.rows.$query, context);

    if (resolved.status === 'waiting' || resolved.rows.length === 0) {
        return (
            <Paper variant="dotted" p="sm">
                <Group gap="xs">
                    {notice?.kind === 'loading' ? <Loader size="xs" /> : null}
                    <Text
                        fz="xs"
                        c={notice?.kind === 'error' ? 'red' : 'dimmed'}
                    >
                        {notice?.message ?? 'No rows'}
                    </Text>
                </Group>
            </Paper>
        );
    }

    const selection =
        selectable === undefined ? null : context.state[selectable.key];
    const isSelected = (id: RowId) =>
        Array.isArray(selection) ? selection.includes(id) : selection === id;
    const toggle = (id: RowId) => {
        if (selectable === undefined) return;
        if (!selectable.multiple) {
            context.setValue(selectable.key, id);
            return;
        }
        const current = Array.isArray(selection) ? selection : [];
        context.setValue(
            selectable.key,
            current.includes(id)
                ? current.filter((selected) => selected !== id)
                : [...current, id],
        );
    };
    const error =
        selectable === undefined ? undefined : context.errors[selectable.key];

    return (
        <Stack gap={4}>
            <Box className={classes.scroll}>
                <Table fz="xs" highlightOnHover withTableBorder>
                    <Table.Thead>
                        <Table.Tr>
                            {selectable === undefined ? null : (
                                <Table.Th className={classes.selectCell} />
                            )}
                            {columns.map((column, index) => (
                                <Table.Th key={`${index}:${column.key}`}>
                                    {column.label}
                                </Table.Th>
                            ))}
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {resolved.rows.map((row, rowIndex) => {
                            const id =
                                selectable === undefined
                                    ? null
                                    : rowIdOf(row, selectable.rowKey);
                            const rowLabel = `Select ${cellText(
                                readPath(row, columns[0].key),
                            )}`;
                            return (
                                <Table.Tr key={`row-${rowIndex}`}>
                                    {selectable === undefined ? null : (
                                        <Table.Td>
                                            {id ===
                                            null ? null : selectable.multiple ? (
                                                <Checkbox
                                                    size="xs"
                                                    aria-label={rowLabel}
                                                    checked={isSelected(id)}
                                                    onChange={() => toggle(id)}
                                                    disabled={context.locked}
                                                />
                                            ) : (
                                                <Radio
                                                    size="xs"
                                                    aria-label={rowLabel}
                                                    checked={isSelected(id)}
                                                    onChange={() => toggle(id)}
                                                    disabled={context.locked}
                                                />
                                            )}
                                        </Table.Td>
                                    )}
                                    {columns.map((column, index) => (
                                        <Table.Td
                                            key={`${index}:${column.key}`}
                                        >
                                            {cellText(
                                                readPath(row, column.key),
                                            )}
                                        </Table.Td>
                                    ))}
                                </Table.Tr>
                            );
                        })}
                    </Table.Tbody>
                </Table>
            </Box>
            {error ? <Input.Error>{error}</Input.Error> : null}
        </Stack>
    );
};
