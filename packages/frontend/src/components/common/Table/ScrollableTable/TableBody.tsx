import { isNumericItem } from '@lightdash/common';
import { flexRender } from '@tanstack/react-table';
import { FC, useCallback } from 'react';
import BodyCell from '../BodyCell';
import { useTableContext } from '../TableProvider';
import { TableColumn } from '../types';

const TableBody: FC = () => {
    const { table, cellContextMenu, setIsScrollable } = useTableContext();

    const handleCellSelect = useCallback(
        (cellId: string | undefined) => {
            setIsScrollable(!cellId);
        },
        [setIsScrollable],
    );

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
                                rowIndex={rowIndex}
                                cell={cell}
                                isNumericItem={isNumericItem(meta?.item)}
                                hasContextMenu={!!cellContextMenu}
                                hasData={!!meta?.item}
                                cellContextMenu={cellContextMenu}
                                onSelect={handleCellSelect}
                            >
                                {flexRender(
                                    cell.column.columnDef.cell,
                                    cell.getContext(),
                                )}
                            </BodyCell>
                        );
                    })}
                </tr>
            ))}
        </tbody>
    );
};

export default TableBody;
