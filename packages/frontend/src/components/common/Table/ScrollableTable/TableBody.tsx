import { isNumericItem } from '@lightdash/common';
import { flexRender } from '@tanstack/react-table';
import { FC, Fragment, useState } from 'react';
import { BodyCell } from '../Table.styles';
import { useTableContext } from '../TableProvider';
import { TableColumn } from '../types';
import RichBodyCell from './RichBodyCell';

const TableBody: FC = () => {
    const { table, cellContextMenu, setIsScrollable } = useTableContext();
    const CellContextMenu = cellContextMenu || Fragment;
    const [selectedCell, setSelectedCell] = useState<string>();

    const handleSetIsScrollable = (value: string | undefined) => {
        setIsScrollable(!value);
        setSelectedCell(value);
    };

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
                                onOpen={() => handleSetIsScrollable(cell.id)}
                                onClose={() => handleSetIsScrollable(undefined)}
                            >
                                <BodyCell
                                    key={cell.id}
                                    $rowIndex={rowIndex}
                                    $isSelected={cell.id === selectedCell}
                                    $hasData={!!meta?.item}
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
