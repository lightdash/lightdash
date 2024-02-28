import {
    getConditionalFormattingColor,
    getConditionalFormattingConfig,
    getConditionalFormattingDescription,
    isNumericItem,
    type ResultRow,
} from '@lightdash/common';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { flexRender, type Row } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import React, { type FC } from 'react';
import { getColorFromRange, readableColor } from '../../../../utils/colorUtils';
import { getConditionalRuleLabel } from '../../Filters/FilterInputs';
import MantineIcon from '../../MantineIcon';
import { ROW_HEIGHT_PX, Tr } from '../Table.styles';
import { useTableContext, type TableContext } from '../TableProvider';
import BodyCell from './BodyCell';

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
    conditionalFormattings: TableContext['conditionalFormattings'];
    minimal?: boolean;
}

// arbitrary number that is usually smaller than the 300px max width of the cell
const SMALL_TEXT_LENGTH = 35;

const TableRow: FC<TableRowProps> = ({
    row,
    index,
    cellContextMenu,
    conditionalFormattings,
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
                        cellValue?.value?.raw,
                        conditionalFormattings,
                    );

                const conditionalFormattingColor =
                    getConditionalFormattingColor(
                        field,
                        cellValue?.value?.raw,
                        conditionalFormattingConfig,
                        getColorFromRange,
                    );

                const tooltipContent = getConditionalFormattingDescription(
                    field,
                    conditionalFormattingConfig,
                    getConditionalRuleLabel,
                );

                const toggleExpander = row.getToggleExpandedHandler();
                const fontColor =
                    conditionalFormattingColor &&
                    readableColor(conditionalFormattingColor) === 'white'
                        ? 'white'
                        : undefined;

                return (
                    <BodyCell
                        minimal={minimal}
                        key={cell.id}
                        style={meta?.style}
                        backgroundColor={conditionalFormattingColor}
                        fontColor={fontColor}
                        className={meta?.className}
                        index={index}
                        cell={cell}
                        isNumericItem={isNumericItem(meta?.item)}
                        hasData={!!meta?.item}
                        cellContextMenu={cellContextMenu}
                        isLargeText={
                            (cellValue?.value?.formatted || '').length >
                            SMALL_TEXT_LENGTH
                        }
                        tooltipContent={tooltipContent}
                    >
                        {cell.getIsGrouped() ? (
                            <>
                                <button
                                    {...{
                                        onClick: (e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            toggleExpander();
                                        },
                                        style: {
                                            cursor: row.getCanExpand()
                                                ? 'pointer'
                                                : 'normal',
                                            border: 'none',
                                            background: 'none',
                                            float: 'left',
                                        },
                                    }}
                                >
                                    <MantineIcon
                                        icon={
                                            row.getIsExpanded()
                                                ? IconChevronDown
                                                : IconChevronRight
                                        }
                                        color={fontColor}
                                        size="xl"
                                        style={{
                                            float: 'left',
                                            margin: -4,
                                        }}
                                    />
                                    <span
                                        style={{
                                            color: fontColor,
                                            marginLeft: 4,
                                        }}
                                    >
                                        ({row.subRows.length})
                                    </span>
                                </button>
                                {flexRender(
                                    cell.column.columnDef.cell,
                                    cell.getContext(),
                                )}
                            </>
                        ) : cell.getIsAggregated() ? (
                            flexRender(
                                cell.column.columnDef.aggregatedCell ??
                                    cell.column.columnDef.cell,
                                cell.getContext(),
                            )
                        ) : cell.getIsPlaceholder() ? null : (
                            flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext(),
                            )
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
    const { table, cellContextMenu, conditionalFormattings } =
        useTableContext();
    const { rows } = table.getRowModel();

    const rowVirtualizer = useVirtualizer({
        getScrollElement: () => tableContainerRef.current,
        count: rows.length,
        estimateSize: () => ROW_HEIGHT_PX,
        overscan: 25,
    });

    const virtualRows = rowVirtualizer.getVirtualItems();
    const paddingTop =
        virtualRows.length > 0 ? virtualRows?.[0]?.start || 0 : 0;
    const paddingBottom =
        virtualRows.length > 0
            ? rowVirtualizer.getTotalSize() -
              (virtualRows?.[virtualRows.length - 1]?.end || 0)
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
