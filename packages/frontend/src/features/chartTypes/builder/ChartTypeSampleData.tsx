import {
    normalizeIndexColumns,
    type DataAppVizContext,
} from '@lightdash/common';
import {
    Box,
    Collapse,
    Group,
    ScrollArea,
    Stack,
    Table,
    Text,
    UnstyledButton,
} from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { useId, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import classes from './ChartTypeSampleData.module.css';

type Column = { reference: string; label: string };

const getColumns = (context: DataAppVizContext): Column[] => {
    if (!context.pivotDetails) {
        return Object.keys(context.rows[0] ?? {}).map((reference) => ({
            reference,
            label: context.fields[reference]?.label ?? reference,
        }));
    }

    const indexColumns = normalizeIndexColumns(
        context.pivotDetails.indexColumn,
    ).map(({ reference }) => ({
        reference,
        label:
            context.fields[reference]?.label ??
            context.pivotDetails?.originalColumns[reference]?.label ??
            reference,
    }));
    const valueColumns = context.pivotDetails.valuesColumns.map((column) => ({
        reference: column.pivotColumnName,
        label: [
            context.fields[column.referenceField]?.label ??
                context.pivotDetails?.originalColumns[column.referenceField]
                    ?.label ??
                column.referenceField,
            ...column.pivotValues.map((value) => value.formatted),
        ].join(' · '),
    }));

    return [...indexColumns, ...valueColumns];
};

const cellValue = (value: DataAppVizContext['rows'][number][string]) =>
    value?.value.formatted ?? '';

type Props = { context: DataAppVizContext | null };

export const ChartTypeSampleData: FC<Props> = ({ context }) => {
    const [opened, setOpened] = useState(false);
    const titleId = useId();
    const contentId = useId();
    if (!context) return null;

    const columns = getColumns(context);
    if (columns.length === 0) return null;

    const rowLabel = context.rows.length === 1 ? 'row' : 'rows';
    const disclosureLabel = `View sample data · ${context.rows.length} ${rowLabel}`;

    return (
        <Box role="region" aria-labelledby={titleId}>
            <UnstyledButton
                id={titleId}
                className={classes.disclosure}
                aria-expanded={opened}
                aria-controls={contentId}
                onClick={() => setOpened((value) => !value)}
            >
                <Group gap="xxs">
                    <Text size="xs" fw={500}>
                        {disclosureLabel}
                    </Text>
                    <MantineIcon
                        icon={opened ? IconChevronDown : IconChevronRight}
                        size={14}
                    />
                </Group>
            </UnstyledButton>
            <Collapse id={contentId} expanded={opened}>
                <Stack gap="xs">
                    <Text size="xs" c="dimmed">
                        Generated example values used in this preview.
                    </Text>
                    <ScrollArea className={classes.tableScroll} type="auto">
                        <Table
                            className={classes.table}
                            aria-label="Generated sample data"
                            fz="xs"
                            horizontalSpacing="xs"
                            verticalSpacing="xxs"
                            withTableBorder
                        >
                            <Table.Thead>
                                <Table.Tr>
                                    {columns.map((column) => (
                                        <Table.Th key={column.reference}>
                                            {column.label}
                                        </Table.Th>
                                    ))}
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {context.rows.map((row, index) => (
                                    <Table.Tr key={index}>
                                        {columns.map((column) => (
                                            <Table.Td key={column.reference}>
                                                {cellValue(
                                                    row[column.reference],
                                                )}
                                            </Table.Td>
                                        ))}
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </ScrollArea>
                </Stack>
            </Collapse>
        </Box>
    );
};
