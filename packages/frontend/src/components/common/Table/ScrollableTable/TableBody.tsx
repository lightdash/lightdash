import { isNumericItem } from '@lightdash/common';
import { flexRender } from '@tanstack/react-table';
import React from 'react';
import { BodyCell } from '../Table.styles';
import { useTableContext } from '../TableProvider';
import { TableColumn } from '../types';

const TableBody = () => {
    const { table, cellContextMenu } = useTableContext();
    const CellContextMenu = cellContextMenu || React.Fragment;
    return (
        <tbody>
            {table.getRowModel().rows.map((row, rowIndex) => (
                <tr key={row.id}>
                    {row.getVisibleCells().map((cell) => {
                        const meta = cell.column.columnDef
                            .meta as TableColumn['meta'];
                        return (
                            <BodyCell
                                key={cell.id}
                                $rowIndex={rowIndex}
                                $isNaN={
                                    !meta?.item || !isNumericItem(meta.item)
                                }
                            >
                                <CellContextMenu cell={cell}>
                                    {flexRender(
                                        cell.column.columnDef.cell,
                                        cell.getContext(),
                                    )}
                                </CellContextMenu>
                            </BodyCell>
                        );
                    })}
                </tr>
            ))}
        </tbody>
    );
};

export default TableBody;
