import {
    getConditionalFormattingColor,
    getConditionalFormattingConfig,
    getConditionalFormattingDescription,
    getItemId,
    isNumericItem,
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
} from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { flexRender, type Row } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import React, { useEffect, useMemo, type FC } from 'react';
import { getColorFromRange, readableColor } from '../../../../utils/colorUtils';
import { getConditionalRuleLabelFromItem } from '../../Filters/FilterInputs/utils';
import MantineIcon from '../../MantineIcon';
import { SMALL_TEXT_LENGTH } from '../constants';
import { ROW_HEIGHT_PX, Tr } from '../Table.styles';
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
                    getConditionalRuleLabelFromItem,
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

const VirtualizedTableBody: FC<{
    tableContainerRef: React.RefObject<HTMLDivElement | null>;
}> = ({ tableContainerRef }) => {
    const {
        table,
        cellContextMenu,
        conditionalFormattings,
        minMaxMap,
        isInfiniteScrollEnabled,
        isFetchingRows,
        fetchMoreRows,
    } = useTableContext();
    const { rows } = table.getRowModel();

    const rowVirtualizer = useVirtualizer({
        getScrollElement: () => tableContainerRef.current,
        count: rows.length,
        estimateSize: (_index) => ROW_HEIGHT_PX,
        overscan: 25,
    });

    useEffect(() => {
        const scrollElement = rowVirtualizer.scrollElement;
        // Check if we're near the end of the list
        const threshold = 100;
        if (
            isInfiniteScrollEnabled &&
            scrollElement &&
            rowVirtualizer.scrollOffset !== null &&
            rowVirtualizer.scrollOffset + scrollElement.clientHeight >=
                scrollElement.scrollHeight - threshold
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
    const paddingTop =
        virtualRows.length > 0 ? virtualRows?.[0]?.start || 0 : 0;
    const paddingBottom =
        virtualRows.length > 0
            ? rowVirtualizer.getTotalSize() -
              (virtualRows?.[virtualRows.length - 1]?.end || 0)
            : 0;
    const cellsCount = rows[0]?.getVisibleCells().length || 0;

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

    return (
        <tbody>
            {paddingTop > 0 && (
                <VirtualizedArea cellCount={cellsCount} padding={paddingTop} />
            )}

            {virtualRows.length === 0 && isFetchingRows
                ? skeletonRows
                : virtualRows.map(({ index }) => {
                      // If this is the last row and we're loading, show the loader
                      if (
                          isFetchingRows &&
                          index + 1 === rows.length &&
                          isInfiniteScrollEnabled
                      ) {
                          return (
                              <tr key={index}>
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
