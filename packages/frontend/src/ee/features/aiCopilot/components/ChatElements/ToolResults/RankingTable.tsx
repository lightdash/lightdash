import { ScrollArea, Table, Text } from '@mantine-8/core';
import type { ReactNode } from 'react';
import classes from './RankingTable.module.css';

type Column<T> = {
    header: string;
    render: (row: T, index: number) => ReactNode;
};

type RankingTableProps<T> = {
    columns: Column<T>[];
    data: T[];
    maxHeight?: number;
    className?: string;
};

export const RankingTable = <T,>({
    columns,
    data,
    maxHeight = 300,
    className,
}: RankingTableProps<T>) => {
    if (data.length === 0) {
        return null;
    }

    return (
        <ScrollArea.Autosize
            mah={maxHeight}
            className={className || classes.tableContainer}
        >
            <Table
                striped
                highlightOnHover
                stickyHeader
                className={classes.table}
            >
                <Table.Thead className={classes.tableHeader}>
                    <Table.Tr>
                        {columns.map((column, index) => (
                            <Table.Th key={index}>{column.header}</Table.Th>
                        ))}
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {data.map((row, rowIndex) => (
                        <Table.Tr key={rowIndex} className={classes.tableRow}>
                            {columns.map((column, colIndex) => (
                                <Table.Td
                                    key={colIndex}
                                    className={classes.tableCell}
                                >
                                    {column.render(row, rowIndex)}
                                </Table.Td>
                            ))}
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>
        </ScrollArea.Autosize>
    );
};

export const TableCellText: React.FC<{
    children: ReactNode;
    dimmed?: boolean;
}> = ({ children, dimmed }) => {
    return (
        <Text
            size="xs"
            c={dimmed ? 'dimmed' : undefined}
            className={
                dimmed ? classes.tableCellTextDimmed : classes.tableCellText
            }
        >
            {children}
        </Text>
    );
};
