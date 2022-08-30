import { isNumericItem } from '@lightdash/common';
import { flexRender } from '@tanstack/react-table';
import { FC } from 'react';
import BodyCell from '../BodyCell';
import { useTableContext } from '../TableProvider';
import { TableColumn } from '../types';

const TableBody: FC = () => {
    const { table, cellContextMenu } = useTableContext();

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
                                hasData={!!meta?.item}
                                cellContextMenu={cellContextMenu}
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
