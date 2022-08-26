import { isNumericItem } from '@lightdash/common';
import { flexRender } from '@tanstack/react-table';
import { FC, useState } from 'react';
import BodyCell from '../BodyCell';
import { useTableContext } from '../TableProvider';
import { TableColumn } from '../types';

const TableBody: FC = () => {
    const { table, cellContextMenu, setIsScrollable } = useTableContext();
    const [selectedCell, setSelectedCell] = useState<string>();

    const handleCellSelect = (cellId: string | undefined) => {
        setIsScrollable(!cellId);
        setSelectedCell(cellId);
    };

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
                                isSelected={cell.id === selectedCell}
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
