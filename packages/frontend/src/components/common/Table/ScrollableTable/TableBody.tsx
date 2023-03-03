import {
    getConditionalFormattingConfig,
    isFilterableItem,
    isNumericItem,
    ResultRow,
} from '@lightdash/common';
import { flexRender } from '@tanstack/react-table';
import React, { FC } from 'react';
import { useVirtual } from 'react-virtual';
import { readableColor } from '../../../../utils/colorUtils';
import { getConditionalRuleLabel } from '../../Filters/configs';
import BodyCell from '../BodyCell';
import { BaseTr, Tr } from '../Table.styles';
import { useTableContext } from '../TableProvider';

const VirtualizedArea: FC<{ cellCount: number; padding: number }> = ({
    cellCount,
    padding,
}) => {
    return (
        <BaseTr>
            {[...Array(cellCount)].map((_, index) => (
                <td
                    key={index}
                    style={{
                        height: `${padding}px`,
                    }}
                />
            ))}
        </BaseTr>
    );
};

const TableBody: FC<{ tableContainerRef: React.RefObject<HTMLDivElement> }> = ({
    tableContainerRef,
}) => {
    const {
        table,
        cellContextMenu,
        selectedCell,
        onSelectCell,
        copyingCellId,
        onCopyCell,
        conditionalFormattings,
    } = useTableContext();
    const { rows } = table.getRowModel();
    const rowVirtualizer = useVirtual({
        parentRef: tableContainerRef,
        size: rows.length,
        overscan: 25,
    });
    const { virtualItems: virtualRows, totalSize } = rowVirtualizer;
    const paddingTop =
        virtualRows.length > 0 ? virtualRows?.[0]?.start || 0 : 0;
    const paddingBottom =
        virtualRows.length > 0
            ? totalSize - (virtualRows?.[virtualRows.length - 1]?.end || 0)
            : 0;
    const cellsCount = rows[0]?.getVisibleCells().length || 0;
    return (
        <tbody>
            {paddingTop > 0 && (
                <VirtualizedArea cellCount={cellsCount} padding={paddingTop} />
            )}
            {virtualRows.map((virtualRow) => {
                const rowIndex = virtualRow.index;
                const row = rows[rowIndex];

                return (
                    <Tr key={row.id} $index={rowIndex}>
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
                                          .map(
                                              (l) => `${l.operator} ${l.value}`,
                                          )
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
                    </Tr>
                );
            })}
            {paddingBottom > 0 && (
                <VirtualizedArea
                    cellCount={cellsCount}
                    padding={paddingBottom}
                />
            )}
        </tbody>
    );
};

export default TableBody;
