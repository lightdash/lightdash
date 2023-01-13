import {
    getConditionalFormattingConfig,
    hasMatchingConditionalRules,
    isNumericItem,
    ResultRow,
} from '@lightdash/common';
import { flexRender } from '@tanstack/react-table';
import { FC } from 'react';
import { readableColor } from '../../../../utils/colorUtils';
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
                        const field = meta?.item;
                        const cellValue = cell.getValue() as
                            | ResultRow[0]
                            | undefined;

                        const fieldConditionalConfig =
                            cellValue &&
                            getConditionalFormattingConfig(
                                conditionalFormattings,
                                field,
                            );

                        const cellHasFormatting = hasMatchingConditionalRules(
                            cellValue?.value.raw as number,
                            fieldConditionalConfig,
                        );

                        return (
                            <BodyCell
                                style={meta?.style}
                                backgroundColor={
                                    cellHasFormatting
                                        ? fieldConditionalConfig?.color
                                        : undefined
                                }
                                fontColor={
                                    cellHasFormatting &&
                                    fieldConditionalConfig?.color &&
                                    readableColor(
                                        fieldConditionalConfig.color,
                                    ) === 'white'
                                        ? 'white'
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
