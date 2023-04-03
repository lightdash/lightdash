import {
    getConditionalFormattingConfig,
    getConditionalFormattingDescription,
    isNumericItem,
    ResultRow,
} from '@lightdash/common';
import { flexRender, Row } from '@tanstack/react-table';
import { useVirtual } from '@tanstack/react-virtual';
import React, { FC } from 'react';
import { readableColor } from '../../../../utils/colorUtils';
import { getConditionalRuleLabel } from '../../Filters/configs';
import BodyCell from '../BodyCell';
import { Tr } from '../Table.styles';
import { TableContext, useTableContext } from '../TableProvider';

const VirtualizedArea: FC<{ cellCount: number; padding: number }> = ({
    cellCount,
    padding,
}) => {
    return (
        <tr>
            {[...Array(cellCount)].map((_, index) => (
                <td
                    key={index}
                    style={{
                        height: `${padding}px`,
                    }}
                />
            ))}
        </tr>
    );
};

interface TableRowProps {
    index: number;
    row: Row<ResultRow>;

    cellContextMenu?: TableContext['cellContextMenu'];
    selectedCell?: TableContext['selectedCell'];
    onSelectCell?: TableContext['onSelectCell'];
    copyingCellId?: TableContext['copyingCellId'];
    onCopyCell?: TableContext['onCopyCell'];
    conditionalFormattings: TableContext['conditionalFormattings'];
    minimal?: boolean;
}

const TableRow: FC<TableRowProps> = ({
    row,
    index,
    copyingCellId,
    selectedCell,
    cellContextMenu,
    conditionalFormattings,
    onCopyCell,
    onSelectCell,
    minimal = false,
}) => {
    return (
        <Tr $index={index}>
            {row.getVisibleCells().map((cell) => {
                const meta = cell.column.columnDef.meta;
                const field = meta?.item;
                const cellValue = cell.getValue() as ResultRow[0] | undefined;

                const conditionalFormattingConfig =
                    getConditionalFormattingConfig(
                        field,
                        cellValue?.value.raw,
                        conditionalFormattings,
                    );

                const tooltipContent = getConditionalFormattingDescription(
                    field,
                    conditionalFormattingConfig,
                    getConditionalRuleLabel,
                );

                return (
                    <BodyCell
                        minimal={minimal}
                        key={cell.id}
                        style={meta?.style}
                        backgroundColor={conditionalFormattingConfig?.color}
                        fontColor={
                            conditionalFormattingConfig?.color &&
                            readableColor(conditionalFormattingConfig.color) ===
                                'white'
                                ? 'white'
                                : undefined
                        }
                        className={meta?.className}
                        index={index}
                        cell={cell}
                        isNumericItem={isNumericItem(meta?.item)}
                        hasData={!!meta?.item}
                        cellContextMenu={cellContextMenu}
                        copying={cell.id === copyingCellId}
                        selected={cell.id === selectedCell?.id}
                        tooltipContent={tooltipContent}
                        onSelect={() => onSelectCell?.(cell)}
                        onDeselect={() => onSelectCell?.(undefined)}
                        onKeyDown={(e) => onCopyCell?.(e)}
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
};

const VirtualizedTableBody: FC<{
    tableContainerRef: React.RefObject<HTMLDivElement>;
}> = ({ tableContainerRef }) => {
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
            {virtualRows.map(({ index }) => {
                return (
                    <TableRow
                        key={index}
                        index={index}
                        row={rows[index]}
                        cellContextMenu={cellContextMenu}
                        selectedCell={selectedCell}
                        onSelectCell={onSelectCell}
                        copyingCellId={copyingCellId}
                        onCopyCell={onCopyCell}
                        conditionalFormattings={conditionalFormattings}
                    />
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

const NormalTableBody: FC = () => {
    const { table, conditionalFormattings } = useTableContext();
    const { rows } = table.getRowModel();

    return (
        <tbody>
            {rows.map((row) => (
                <TableRow
                    key={row.index}
                    minimal
                    index={row.index}
                    row={row}
                    conditionalFormattings={conditionalFormattings}
                />
            ))}
        </tbody>
    );
};

interface TableBodyProps {
    minimal?: boolean;
    tableContainerRef: React.RefObject<HTMLDivElement>;
}

const TableBody: FC<TableBodyProps> = ({ minimal, tableContainerRef }) => {
    if (minimal) {
        return <NormalTableBody />;
    } else {
        return <VirtualizedTableBody tableContainerRef={tableContainerRef} />;
    }
};

export default TableBody;
