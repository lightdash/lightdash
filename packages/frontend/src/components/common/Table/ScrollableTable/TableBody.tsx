import {
    ConditionalFormattingColorApplyTo,
    getConditionalFormattingColor,
    getConditionalFormattingConfig,
    getConditionalFormattingDescription,
    getConditionalFormattingTextStyle,
    getItemId,
    getReadableTextColor,
    getRowConditionalFormattingColor,
    getRowConditionalFormattingConfig,
    isNumericItem,
    type ConditionalFormattingColorRange,
    type ConditionalFormattingMinMax,
    type ConditionalFormattingRowFields,
    type ResultRow,
} from '@lightdash/common';
import {
    Button,
    Center,
    Group,
    Loader,
    Skeleton,
    Tooltip,
    useMantineColorScheme,
} from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { flexRender, type Row } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import React, { useCallback, useEffect, useMemo, type FC } from 'react';
import {
    getColorFromRange,
    transformColorsForDarkMode,
} from '../../../../utils/colorUtils';
import { getConditionalRuleLabelFromItem } from '../../Filters/FilterInputs/utils';
import MantineIcon from '../../MantineIcon';
import {
    getRowSpanMerges,
    type RowSpanMerge,
} from '../../PivotTable/getRowSpanMerges';
import {
    FROZEN_COLUMN_BACKGROUND,
    ROW_HEIGHT_PX,
    SMALL_TEXT_LENGTH,
} from '../constants';
import { getGroupedDimensionColumnIds } from '../getGroupedDimensionColumnIds';
import { Tr } from '../Table.styles';
import { type TableContext } from '../types';
import { useTableContext } from '../useTableContext';
import { countSubRows } from '../utils';
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
    virtualIndex: number;
    row: Row<ResultRow>;
    measureElement: (node: HTMLElement | null) => void;
    cellContextMenu?: TableContext['cellContextMenu'];
    conditionalFormattings: TableContext['conditionalFormattings'];
    minMaxMap: TableContext['minMaxMap'];
    minimal?: boolean;
    // Per-column rowSpan-merge info for row-grouping mode, keyed by column id;
    // null when not in row-grouping mode.
    rowSpanMergesByColumnId?: Map<string, RowSpanMerge[]> | null;
}

const TableRow: FC<TableRowProps> = ({
    row,
    index,
    virtualIndex,
    measureElement,
    cellContextMenu,
    conditionalFormattings,
    minMaxMap,
    minimal = false,
    rowSpanMergesByColumnId,
}) => {
    const { colorScheme } = useMantineColorScheme();
    const rowFields = useMemo(
        () =>
            row
                .getAllCells() // get all as they can be necessary for conditional formatting
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
    const getEffectiveColorFromRange = useCallback(
        (
            val: number,
            colorRange: ConditionalFormattingColorRange,
            minMaxRange: ConditionalFormattingMinMax,
        ) => {
            const effectiveColorRange =
                colorScheme === 'dark'
                    ? transformColorsForDarkMode(colorRange)
                    : colorRange;
            return getColorFromRange(val, effectiveColorRange, minMaxRange);
        },
        [colorScheme],
    );

    const rowBackgroundColor = useMemo(
        () =>
            getRowConditionalFormattingColor({
                conditionalFormattings,
                rowFields,
                minMaxMap,
            }),
        [conditionalFormattings, rowFields, minMaxMap],
    );

    const rowConditionalFormattingConfig = useMemo(
        () =>
            getRowConditionalFormattingConfig({
                conditionalFormattings,
                rowFields,
                minMaxMap,
            }),
        [conditionalFormattings, rowFields, minMaxMap],
    );

    return (
        <Tr $index={index} ref={measureElement} data-index={virtualIndex}>
            {row.getVisibleCells().map((cell) => {
                const rowSpanMerge = rowSpanMergesByColumnId?.get(
                    cell.column.id,
                )?.[index];
                // Absorbed (non-block-start) merged cell: the block-start cell's
                // rowSpan already covers this row, so render no <td> here.
                if (rowSpanMerge && !rowSpanMerge.isBlockStart) {
                    return null;
                }

                const meta = cell.column.columnDef.meta;
                const field = meta?.item;
                const cellValue = cell.getValue() as ResultRow[0] | undefined;

                const cellConditionalFormattingConfig =
                    getConditionalFormattingConfig({
                        field,
                        value: cellValue?.value?.raw,
                        minMaxMap,
                        conditionalFormattings,
                        rowFields,
                        applyTo: ConditionalFormattingColorApplyTo.CELL,
                    });
                const textConditionalFormattingConfig =
                    getConditionalFormattingConfig({
                        field,
                        value: cellValue?.value?.raw,
                        minMaxMap,
                        conditionalFormattings,
                        rowFields,
                        applyTo: ConditionalFormattingColorApplyTo.TEXT,
                    });

                const cellConditionalFormattingResult =
                    getConditionalFormattingColor({
                        field,
                        value: cellValue?.value?.raw,
                        minMaxMap,
                        config: cellConditionalFormattingConfig,
                        getColorFromRange: getEffectiveColorFromRange,
                    });
                const textConditionalFormattingResult =
                    getConditionalFormattingColor({
                        field,
                        value: cellValue?.value?.raw,
                        minMaxMap,
                        config: textConditionalFormattingConfig,
                        getColorFromRange: getEffectiveColorFromRange,
                    });

                // Frozen/locked rows should have a fixed background, unless there is a conditional formatting color applied to cell
                let backgroundColor: string | undefined;
                if (cellConditionalFormattingResult) {
                    backgroundColor = cellConditionalFormattingResult.color;
                } else if (rowBackgroundColor) {
                    backgroundColor = rowBackgroundColor;
                } else if (meta?.frozen) {
                    backgroundColor = FROZEN_COLUMN_BACKGROUND;
                }

                const tooltipContent = [
                    getConditionalFormattingDescription(
                        field,
                        cellConditionalFormattingConfig,
                        rowFields,
                        getConditionalRuleLabelFromItem,
                    ),
                    getConditionalFormattingDescription(
                        field,
                        textConditionalFormattingConfig,
                        rowFields,
                        getConditionalRuleLabelFromItem,
                    ),
                ]
                    .filter(
                        (description, index, descriptions) =>
                            description &&
                            descriptions.indexOf(description) === index,
                    )
                    .join('; ');

                const toggleExpander = row.getToggleExpandedHandler();
                // When conditional formatting is applied to cell, use calculated contrast color
                // When applied to text, use the formatting color directly
                let fontColor: string | undefined;
                if (textConditionalFormattingResult) {
                    fontColor = textConditionalFormattingResult.color;
                } else if (cellConditionalFormattingResult) {
                    fontColor = getReadableTextColor(
                        cellConditionalFormattingResult.color,
                    );
                } else if (rowBackgroundColor) {
                    fontColor = getReadableTextColor(rowBackgroundColor);
                }

                const textStyle = getConditionalFormattingTextStyle([
                    cellConditionalFormattingConfig,
                    textConditionalFormattingConfig,
                    rowConditionalFormattingConfig,
                ]);

                const suppressContextMenu =
                    cell.getIsPlaceholder() || cell.getIsAggregated();

                return (
                    <BodyCell
                        minimal={minimal}
                        rowSpan={rowSpanMerge?.rowSpan}
                        key={cell.id}
                        style={meta?.style}
                        backgroundColor={backgroundColor}
                        fontColor={fontColor}
                        textStyle={textStyle}
                        className={meta?.className}
                        index={index}
                        cell={cell}
                        isNumericItem={
                            isNumericItem(meta?.item) &&
                            !(
                                meta?.item &&
                                'richText' in meta.item &&
                                meta.item.richText
                            )
                        }
                        hasData={!!meta?.item}
                        cellContextMenu={
                            suppressContextMenu ? undefined : cellContextMenu
                        }
                        isLargeText={
                            (cellValue?.value?.formatted || '').length >
                            SMALL_TEXT_LENGTH
                        }
                        tooltipContent={tooltipContent || undefined}
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

const SCROLL_THRESHOLD = 100;

const VirtualizedTableBody: FC<{
    tableContainerRef: React.RefObject<HTMLDivElement | null>;
    minimal?: boolean;
    showSubtotals?: boolean;
    showRowGrouping?: boolean;
}> = ({ tableContainerRef, minimal, showSubtotals, showRowGrouping }) => {
    const {
        table,
        columns,
        cellContextMenu,
        conditionalFormattings,
        minMaxMap,
        isInfiniteScrollEnabled,
        isFetchingRows,
        fetchMoreRows,
    } = useTableContext();
    const { rows } = table.getRowModel();

    // Row-grouping (no subtotals): merge repeated dimension values with rowSpan,
    // matching the pivot table. Renders a flat row model (no TanStack grouping),
    // so rowSpans line up with the source rows.
    const groupingOnlyMode = !!showRowGrouping && !showSubtotals;
    const columnOrder = table.getState().columnOrder;
    const rowSpanMergesByColumnId = useMemo(() => {
        if (!groupingOnlyMode) return null;
        const groupedColumnIds = getGroupedDimensionColumnIds(
            columns,
            columnOrder,
        );
        if (groupedColumnIds.length === 0) return null;
        return getRowSpanMerges(
            rows.length,
            groupedColumnIds,
            (rowIndex, columnId) =>
                (
                    rows[rowIndex]?.getValue(columnId) as
                        | { value?: { raw?: unknown } }
                        | undefined
                )?.value?.raw,
        );
    }, [groupingOnlyMode, columns, columnOrder, rows]);

    const rowVirtualizer = useVirtualizer({
        getScrollElement: () => tableContainerRef.current,
        count: rows.length,
        estimateSize: (_index) => ROW_HEIGHT_PX,
        overscan: 25,
    });

    useEffect(() => {
        const scrollElement = rowVirtualizer.scrollElement;
        // Trigger fetching when user is within SCROLL_THRESHOLD px of the bottom
        // Scrolling math explanation:
        // - rowVirtualizer.scrollOffset: Current scroll position from top (how far user has scrolled down)
        // - scrollElement.clientHeight: Visible height of the scrollable container (viewport height)
        // - scrollElement.scrollHeight: Total scrollable height (all content including non-visible)
        // - We fetch more when: (scrollOffset + clientHeight) >= (scrollHeight - threshold)
        //   This means: current position + visible area >= total height minus buffer zone
        if (
            isInfiniteScrollEnabled &&
            scrollElement &&
            rowVirtualizer.scrollOffset !== null &&
            rowVirtualizer.scrollOffset + scrollElement.clientHeight >=
                scrollElement.scrollHeight - SCROLL_THRESHOLD
        ) {
            fetchMoreRows();
        }
    }, [
        rowVirtualizer.scrollOffset,
        fetchMoreRows,
        isInfiniteScrollEnabled,
        rowVirtualizer.scrollElement,
    ]);

    const virtualRows = rowVirtualizer.getVirtualItems();
    const cellsCount = rows[0]?.getVisibleCells().length || 0;

    const measureElement = useCallback(
        (node: HTMLElement | null) => {
            rowVirtualizer.measureElement(node);
        },
        [rowVirtualizer],
    );

    const skeletonRows = useMemo(() => {
        const tableColumnsCount = table.getAllColumns().length;
        const pageSize = table.getState().pagination.pageSize;

        return Array.from({ length: pageSize }).map((_, index) => {
            return (
                <tr key={index}>
                    {Array.from({ length: tableColumnsCount }).map(
                        (__, colIdx) => (
                            <td key={colIdx} style={{ padding: 8.5 }}>
                                <Skeleton
                                    w="100%"
                                    // Removing 17px to account for the padding of the table defined in Table.styles.ts
                                    h={`calc(${ROW_HEIGHT_PX}px - 17px)`}
                                />
                            </td>
                        ),
                    )}
                </tr>
            );
        });
    }, [table]);

    // Use before/after padding rows to maintain correct total scroll height
    // while only rendering visible rows
    const paddingTop = virtualRows.length > 0 ? virtualRows[0]?.start || 0 : 0;
    const paddingBottom =
        virtualRows.length > 0
            ? rowVirtualizer.getTotalSize() -
              (virtualRows[virtualRows.length - 1]?.end || 0)
            : 0;

    // Row-grouping mode renders every row (no virtualization) so the merged
    // dimension cells' rowSpans span their full block — virtualization would
    // unmount the absorbed rows and break the span.
    if (groupingOnlyMode) {
        return (
            <tbody>
                {rows.map((row, index) => (
                    <TableRow
                        minimal={minimal}
                        key={index}
                        index={index}
                        virtualIndex={index}
                        measureElement={measureElement}
                        row={row}
                        cellContextMenu={cellContextMenu}
                        conditionalFormattings={conditionalFormattings}
                        minMaxMap={minMaxMap}
                        rowSpanMergesByColumnId={rowSpanMergesByColumnId}
                    />
                ))}
            </tbody>
        );
    }

    return (
        <tbody>
            {paddingTop > 0 && (
                <VirtualizedArea cellCount={cellsCount} padding={paddingTop} />
            )}

            {virtualRows.length === 0 && isFetchingRows
                ? skeletonRows
                : virtualRows.map((virtualRow) => {
                      const { index } = virtualRow;
                      // If this is the last row and we're loading, show the loader
                      if (
                          isFetchingRows &&
                          index + 1 === rows.length &&
                          isInfiniteScrollEnabled
                      ) {
                          return (
                              <tr
                                  key={index}
                                  data-index={virtualRow.index}
                                  ref={measureElement}
                              >
                                  <td
                                      colSpan={
                                          table.getVisibleFlatColumns().length
                                      }
                                  >
                                      <Center>
                                          <Tooltip
                                              withinPortal
                                              position="top"
                                              label={`Loading more rows...`}
                                          >
                                              <Loader size="xs" color="gray" />
                                          </Tooltip>
                                      </Center>
                                  </td>
                              </tr>
                          );
                      }

                      return (
                          <TableRow
                              minimal={minimal}
                              key={index}
                              index={index}
                              virtualIndex={virtualRow.index}
                              measureElement={measureElement}
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

interface TableBodyProps {
    minimal?: boolean;
    tableContainerRef: React.RefObject<HTMLDivElement | null>;
    showSubtotals?: boolean;
    showRowGrouping?: boolean;
}

const TableBody: FC<TableBodyProps> = ({
    minimal,
    tableContainerRef,
    showSubtotals,
    showRowGrouping,
}) => {
    return (
        <VirtualizedTableBody
            tableContainerRef={tableContainerRef}
            minimal={minimal}
            showSubtotals={showSubtotals}
            showRowGrouping={showRowGrouping}
        />
    );
};

export default TableBody;
