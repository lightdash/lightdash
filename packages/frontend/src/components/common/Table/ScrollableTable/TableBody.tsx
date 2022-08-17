import { isNumericItem, ResultRow } from '@lightdash/common';
import { Cell, flexRender } from '@tanstack/react-table';
import React, { FC } from 'react';
import styled from 'styled-components';
import { BodyCell } from '../Table.styles';
import { useTableContext } from '../TableProvider';
import { TableColumn } from '../types';

const Link = styled.a``;

interface RichBodyCellProps {
    cell: Cell<ResultRow>;
}

const RichBodyCell: FC<RichBodyCellProps> = ({ children, cell }) => {
    const rawValue = cell.getValue()?.value?.raw;

    if (
        rawValue &&
        typeof rawValue === 'string' &&
        (rawValue.startsWith('http://') || rawValue.startsWith('https://'))
    ) {
        return (
            <Link href={rawValue} target="_blank">
                {children}
            </Link>
        );
    } else {
        return <>{children}</>;
    }
};

const TableBody = () => {
    const { table, cellContextMenu } = useTableContext();
    const CellContextMenu = cellContextMenu || React.Fragment;
    const [selectedCell, setSelectedCell] = React.useState<string>();

    return (
        <tbody>
            {table.getRowModel().rows.map((row, rowIndex) => (
                <tr key={row.id}>
                    {row.getVisibleCells().map((cell) => {
                        const meta = cell.column.columnDef
                            .meta as TableColumn['meta'];
                        return (
                            <CellContextMenu
                                cell={cell}
                                onOpen={() => setSelectedCell(cell.id)}
                                onClose={() => setSelectedCell(undefined)}
                            >
                                <BodyCell
                                    key={cell.id}
                                    $rowIndex={rowIndex}
                                    $isSelected={cell.id === selectedCell}
                                    $isNaN={
                                        !meta?.item || !isNumericItem(meta.item)
                                    }
                                >
                                    <RichBodyCell cell={cell}>
                                        {flexRender(
                                            cell.column.columnDef.cell,
                                            cell.getContext(),
                                        )}
                                    </RichBodyCell>
                                </BodyCell>
                            </CellContextMenu>
                        );
                    })}
                </tr>
            ))}
        </tbody>
    );
};

export default TableBody;
