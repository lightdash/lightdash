import {
    assertUnreachable,
    FilterOperator,
    getItemId,
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

                        const hasFormatting =
                            fieldConditionalFormattings?.filter.values?.every(
                                (conditionalValue) => {
                                    const operator =
                                        fieldConditionalFormattings.filter
                                            .operator;

                                    const rawValue = cellValue.value.raw;
                                    const intValue = parseInt(conditionalValue);

                                    switch (operator) {
                                        case FilterOperator.NULL:
                                            return rawValue === null;
                                        case FilterOperator.NOT_NULL:
                                            return rawValue !== intValue;
                                        case FilterOperator.EQUALS:
                                            return rawValue === intValue;
                                        case FilterOperator.NOT_EQUALS:
                                            return rawValue !== intValue;
                                        case FilterOperator.LESS_THAN:
                                            return rawValue < intValue;
                                        case FilterOperator.GREATER_THAN:
                                            return rawValue > intValue;
                                        case FilterOperator.STARTS_WITH:
                                        case FilterOperator.INCLUDE:
                                        case FilterOperator.NOT_INCLUDE:
                                        case FilterOperator.LESS_THAN_OR_EQUAL:
                                        case FilterOperator.GREATER_THAN_OR_EQUAL:
                                        case FilterOperator.IN_THE_PAST:
                                            throw new Error('Not implemented');
                                        default:
                                            return assertUnreachable(
                                                operator,
                                                'Unknown operator',
                                            );
                                    }
                                },
                            );

                        return (
                            <BodyCell
                                style={meta?.style}
                                backgroundColor={
                                    hasFormatting
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
