import {
    getItemId,
    hasConditionalFormatting,
    isNumericItem,
    ResultRow,
} from '@lightdash/common';
import { flexRender } from '@tanstack/react-table';
import { FC } from 'react';
import BodyCell from '../BodyCell';
import { useTableContext } from '../TableProvider';

const TableBody: FC = () => {
    const {
        table,
        cellContextMenu,
        selectedCell,
        onSelectCell,
        copyingCellId,
        onCopyCell,
        conditionalFormattings,
    } = useTableContext();

    return (
        <tbody>
            {table.getRowModel().rows.map((row, rowIndex) => (
                <tr key={row.id}>
                    {row.getVisibleCells().map((cell) => {
                        const meta = cell.column.columnDef.meta;
                        // TODO: typedef
                        const cellValue = cell.getValue() as ResultRow[0];

                        // TODO: extract all this
                        const fieldConditionalFormattings =
                            conditionalFormattings?.find((config) => {
                                return (
                                    getItemId(config.field) ===
                                    (meta?.item
                                        ? getItemId(meta.item)
                                        : undefined)
                                );
                            });

                        const cellHasFormatting =
                            fieldConditionalFormattings?.rules &&
                            fieldConditionalFormattings.rules.length > 0
                                ? hasConditionalFormatting(
                                      fieldConditionalFormattings.rules,
                                      cellValue.value.raw as number,
                                  )
                                : false;

                        return (
                            <BodyCell
                                style={meta?.style}
                                backgroundColor={
                                    cellHasFormatting
                                        ? fieldConditionalFormattings?.color
                                        : undefined
                                }
                                className={meta?.className}
                                key={cell.id}
                                rowIndex={rowIndex}
                                cell={cell}
                                isNumericItem={isNumericItem(meta?.item)}
                                hasData={!!meta?.item}
                                cellContextMenu={cellContextMenu}
                                copying={cell.id === copyingCellId}
                                selected={cell.id === selectedCell?.id}
                                onSelect={() => onSelectCell(cell)}
                                onDeselect={() => onSelectCell(undefined)}
                                onKeyDown={onCopyCell}
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
