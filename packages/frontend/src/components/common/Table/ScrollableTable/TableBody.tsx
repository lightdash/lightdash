import { isNumericItem } from '@lightdash/common';
import { flexRender } from '@tanstack/react-table';
import { FC, Fragment, useState } from 'react';
import { BodyCell } from '../Table.styles';
import { useTableContext } from '../TableProvider';
import { TableColumn } from '../types';
import RichBodyCell from './RichBodyCell';

const TableBody: FC = () => {
    const { table, cellContextMenu } = useTableContext();
    const CellContextMenu = cellContextMenu || Fragment;
    const [selectedCell, setSelectedCell] = useState<string>();

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
