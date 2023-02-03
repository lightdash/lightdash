import {
    getConditionalFormattingConfig,
    isFilterableItem,
    isNumericItem,
    ResultRow,
} from '@lightdash/common';
import { flexRender } from '@tanstack/react-table';
import { FC } from 'react';
import { readableColor } from '../../../../utils/colorUtils';
import { getConditionalRuleLabel } from '../../Filters/configs';
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

                        const conditionalFormattingConfig =
                            getConditionalFormattingConfig(
                                field,
                                cellValue?.value.raw,
                                conditionalFormattings,
                            );

                        const tooltipContent =
                            field &&
                            isFilterableItem(field) &&
                            conditionalFormattingConfig &&
                            conditionalFormattingConfig?.rules.length > 0
                                ? conditionalFormattingConfig.rules
                                      .map((r) =>
                                          getConditionalRuleLabel(r, field),
                                      )
                                      .map((l) => `${l.operator} ${l.value}`)
                                      .join(' and ')
                                : undefined;

                        return (
                            <BodyCell
                                key={cell.id}
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
                                rowIndex={rowIndex}
                                cell={cell}
                                isNumericItem={isNumericItem(meta?.item)}
                                hasData={!!meta?.item}
                                cellContextMenu={cellContextMenu}
                                copying={cell.id === copyingCellId}
                                selected={cell.id === selectedCell?.id}
                                tooltipContent={tooltipContent}
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
