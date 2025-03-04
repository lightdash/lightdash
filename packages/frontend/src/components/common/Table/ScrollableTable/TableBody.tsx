import {
    getConditionalFormattingColor,
    getConditionalFormattingConfig,
    getConditionalFormattingDescription,
    getItemId,
    isNumericItem,
    type ConditionalFormattingRowFields,
    type ResultRow,
} from '@lightdash/common';
import { Button, Group } from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { flexRender, type Row } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import React, { useMemo, type FC } from 'react';
import { getColorFromRange, readableColor } from '../../../../utils/colorUtils';
import { getConditionalRuleLabel } from '../../Filters/FilterInputs/utils';
import MantineIcon from '../../MantineIcon';
import { ROW_HEIGHT_PX, Tr } from '../Table.styles';
import { type TableContext } from '../types';
import { useTableContext } from '../useTableContext';
import { countSubRows } from '../utils';
import { SMALL_TEXT_LENGTH } from './../constants';
import BodyCell from './BodyCell';

export const VirtualizedArea: FC<{ cellCount: number; padding: number }> = ({
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
    minMaxMap: TableContext['minMaxMap'];
    minimal?: boolean;
}

const TableRow: FC<TableRowProps> = ({
    row,
    index,
    cellContextMenu,
    conditionalFormattings,
    minMaxMap,
    minimal = false,
}) => {
    const rowFields = useMemo(
        () =>
            row
                .getVisibleCells()
                .reduce<ConditionalFormattingRowFields>((acc, cell) => {
                    const meta = cell.column.columnDef.meta;
                    if (meta?.item) {
                        const cellValue = cell.getValue() as
                            | ResultRow[0]
                            | undefined;

                        acc[getItemId(meta.item)] = {
                            field: meta.item,
                            value: cellValue?.value?.raw,
                        };
                    }
                    return acc;
                }, {}),
        [row],
    );

    return (
        <Tr $index={index}>
            {row.getVisibleCells().map((cell) => {
                const meta = cell.column.columnDef.meta;
                const field = meta?.item;
                const cellValue = cell.getValue() as ResultRow[0] | undefined;

                const conditionalFormattingConfig =
                    getConditionalFormattingConfig({
                        field,
                        value: cellValue?.value?.raw,
                        minMaxMap,
                        conditionalFormattings,
                        rowFields,
                    });

                const conditionalFormattingColor =
                    getConditionalFormattingColor({
                        field,
                        value: cellValue?.value?.raw,
                        minMaxMap,
                        config: conditionalFormattingConfig,
                        getColorFromRange,
                    });

                // Frozen/locked rows should have a white background, unless there is a conditional formatting color
                let backgroundColor: string | undefined;
                if (conditionalFormattingColor) {
                    backgroundColor = conditionalFormattingColor;
                } else if (meta?.frozen) {
                    backgroundColor = 'white';
                }

                const tooltipContent = getConditionalFormattingDescription(
                    field,
                    conditionalFormattingConfig,
                    rowFields,
                    getConditionalRuleLabel,
                );

                const toggleExpander = row.getToggleExpandedHandler();
                const fontColor =
                    conditionalFormattingColor &&
                    readableColor(conditionalFormattingColor) === 'white'
                        ? 'white'
                        : undefined;

                const suppressContextMenu =
                    cell.getIsPlaceholder() || cell.getIsAggregated();

                return (
                    <BodyCell
                        minimal={minimal}
                        key={cell.id}
                        style={meta?.style}
                        backgroundColor={backgroundColor}
                        fontColor={fontColor}
                        className={meta?.className}
                        index={index}
                        cell={cell}
                        isNumericItem={isNumericItem(meta?.item)}
                        hasData={!!meta?.item}
                        cellContextMenu={
                            suppressContextMenu ? undefined : cellContextMenu
                        }
                        isLargeText={
                            (cellValue?.value?.formatted || '').length >
                            SMALL_TEXT_LENGTH
                        }
                        tooltipContent={tooltipContent}
                    >
                        {cell.getIsGrouped() ? (
                            <Group spacing="xxs">
                                <Button
                                    compact
                                    size="xs"
                                    variant="subtle"
                                    styles={(theme) => ({
                                        root: {
                                            height: 'unset',
                                            paddingLeft: theme.spacing.two,
                                            paddingRight: theme.spacing.xxs,
                                        },
                                        leftIcon: {
                                            marginRight: 0,
                                        },
                                    })}
                                    onClick={(
                                        e: React.MouseEvent<HTMLButtonElement>,
                                    ) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        toggleExpander();
                                    }}
                                    leftIcon={
                                        <MantineIcon
                                            size={14}
                                            icon={
                                                row.getIsExpanded()
                                                    ? IconChevronDown
                                                    : IconChevronRight
                                            }
                                        />
                                    }
                                    style={{
                                        color: fontColor ?? 'inherit',
                                    }}
                                >
                                    ({countSubRows(row)})
                                </Button>
                                {flexRender(
                                    cell.column.columnDef.cell,
                                    cell.getContext(),
                                )}
                            </Group>
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
/**
 * Get the maximum height of a row, by calculating the max height of each cell
 * This method will only take new lines (`\n`) into account, this will not work for long text that is broken down into multiple lines
 * By calculating the max row height, we can fix the flickering issue when scrolling and some rows are big
 * See issue: https://github.com/lightdash/lightdash/issues/13882
 * @param row - The row to calculate the height for
 * @returns The maximum height of the row
 */
const getMaxRowHeight = (row: Row<ResultRow>) => {
    return row.getVisibleCells().reduce((acc, cell) => {
        const lines = (
            cell.getValue() as ResultRow[0] | undefined
        )?.value?.formatted?.split('\n');
        if (!lines) return acc;
        return Math.max(acc, lines?.length * ROW_HEIGHT_PX);
    }, ROW_HEIGHT_PX);
};
const VirtualizedTableBody: FC<{
    tableContainerRef: React.RefObject<HTMLDivElement | null>;
}> = ({ tableContainerRef }) => {
    const { table, cellContextMenu, conditionalFormattings, minMaxMap } =
        useTableContext();
    const { rows } = table.getRowModel();

    const rowVirtualizer = useVirtualizer({
        getScrollElement: () => tableContainerRef.current,
        count: rows.length,
        estimateSize: (index) => {
            try {
                return getMaxRowHeight(rows[index]);
            } catch (e) {
                console.error('Error getting row height', e);
                return ROW_HEIGHT_PX;
            }
        },
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
                        minMaxMap={minMaxMap}
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
    const { table, cellContextMenu, conditionalFormattings, minMaxMap } =
        useTableContext();
    const { rows } = table.getRowModel();

    return (
        <tbody>
            {rows.map((row, index) => (
                <TableRow
                    key={index}
                    minimal
                    index={index}
                    row={row}
                    cellContextMenu={cellContextMenu}
                    conditionalFormattings={conditionalFormattings}
                    minMaxMap={minMaxMap}
                />
            ))}
        </tbody>
    );
};

interface TableBodyProps {
    minimal?: boolean;
    tableContainerRef: React.RefObject<HTMLDivElement | null>;
}

const TableBody: FC<TableBodyProps> = ({ minimal, tableContainerRef }) => {
    if (minimal) {
        return <NormalTableBody />;
    } else {
        return <VirtualizedTableBody tableContainerRef={tableContainerRef} />;
    }
};

export default TableBody;
