import {
    getConditionalFormattingConfigs,
    hasMatchingConditionalRules,
    isNumericItem,
    ResultRow,
} from '@lightdash/common';
import { flexRender } from '@tanstack/react-table';
import findLast from 'lodash-es/findLast';
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

                        const fieldConditionalConfigs =
                            cellValue &&
                            getConditionalFormattingConfigs(
                                conditionalFormattings,
                                field,
                            );

                        const conditionalFormattingConfig =
                            fieldConditionalConfigs &&
                            findLast(fieldConditionalConfigs, (c) => {
                                return hasMatchingConditionalRules(
                                    cellValue?.value.raw as number | string,
                                    c,
                                );
                            });

                        return (
                            <BodyCell
                                style={meta?.style}
                                backgroundColor={
                                    conditionalFormattingConfig?.color
                                }
                                fontColor={
                                    conditionalFormattingConfig?.color &&
                                    readableColor(
                                        conditionalFormattingConfig.color,
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
                                tooltipContent={
                                    cellHasFormatting
                                        ? 'has formatting'
                                        : undefined
                                }
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
