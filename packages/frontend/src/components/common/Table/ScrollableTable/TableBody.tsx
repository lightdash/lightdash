import {
    ConditionalFormattingColorApplyTo,
    getConditionalFormattingColor,
    getConditionalFormattingConfig,
    getConditionalFormattingDescription,
    getItemId,
    getReadableTextColor,
    isNumericItem,
    type RawResultRow,
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
import { getHotkeyHandler, useClipboard } from '@mantine/hooks';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { flexRender, type Cell, type Row } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import useToaster from '../../../../hooks/toaster/useToaster';
import {
    getColorFromRange,
    transformColorsForDarkMode,
} from '../../../../utils/colorUtils';
import { getConditionalRuleLabelFromItem } from '../../Filters/FilterInputs/utils';
import MantineIcon from '../../MantineIcon';
import {
    FROZEN_COLUMN_BACKGROUND,
    ROW_HEIGHT_PX,
    SMALL_TEXT_LENGTH,
} from '../constants';
import { Tr } from '../Table.styles';
import { type TableContext } from '../types';
import { useTableContext } from '../useTableContext';
import { countSubRows } from '../utils';
import BodyCell from './BodyCell';
import CellMenu from './CellMenu';
import CellTooltip from './CellTooltip';

type ActiveMenuState = {
    cellId: string;
    cell: Cell<ResultRow, unknown> | Cell<RawResultRow, unknown>;
    bounds: DOMRect;
    displayValue: string | RawResultRow | null;
};

type ActiveTooltipState = {
    cellId: string;
    bounds: DOMRect;
    label: string;
};

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
    activeMenuCellId: string | null;
    onMenuToggle: (
        cell: Cell<ResultRow, unknown> | Cell<RawResultRow, unknown>,
        elementBounds: DOMRect,
        displayValue: string | RawResultRow | null,
    ) => void;
    onTooltipShow: (
        cellId: string,
        label: string,
        elementBounds: DOMRect,
    ) => void;
    onTooltipHide: (cellId: string) => void;
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
    activeMenuCellId,
    onMenuToggle,
    onTooltipShow,
    onTooltipHide,
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

    return (
        <Tr $index={index} ref={measureElement} data-index={virtualIndex}>
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

                const conditionalFormattingResult =
                    getConditionalFormattingColor({
                        field,
                        value: cellValue?.value?.raw,
                        minMaxMap,
                        config: conditionalFormattingConfig,
                        getColorFromRange: (val, colorRange, minMaxRange) => {
                            const effectiveColorRange =
                                colorScheme === 'dark'
                                    ? transformColorsForDarkMode(colorRange)
                                    : colorRange;
                            return getColorFromRange(
                                val,
                                effectiveColorRange,
                                minMaxRange,
                            );
                        },
                    });

                const applyToText =
                    conditionalFormattingResult?.applyTo ===
                    ConditionalFormattingColorApplyTo.TEXT;

                // Frozen/locked rows should have a fixed background, unless there is a conditional formatting color applied to cell
                let backgroundColor: string | undefined;
                if (conditionalFormattingResult && !applyToText) {
                    backgroundColor = conditionalFormattingResult.color;
                } else if (meta?.frozen) {
                    backgroundColor = FROZEN_COLUMN_BACKGROUND;
                }

                const tooltipContent = getConditionalFormattingDescription(
                    field,
                    conditionalFormattingConfig,
                    rowFields,
                    getConditionalRuleLabelFromItem,
                );

                const toggleExpander = row.getToggleExpandedHandler();
                // When conditional formatting is applied to cell, use calculated contrast color
                // When applied to text, use the formatting color directly
                let fontColor: string | undefined;
                if (conditionalFormattingResult) {
                    fontColor = applyToText
                        ? conditionalFormattingResult.color
                        : getReadableTextColor(
                              conditionalFormattingResult.color,
                          );
                }

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
                        isSelected={activeMenuCellId === cell.id}
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
                        tooltipContent={tooltipContent}
                        onMenuToggle={onMenuToggle}
                        onTooltipShow={onTooltipShow}
                        onTooltipHide={onTooltipHide}
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
}> = ({ tableContainerRef, minimal }) => {
    const {
        table,
        cellContextMenu,
        conditionalFormattings,
        minMaxMap,
        isInfiniteScrollEnabled,
        isFetchingRows,
        fetchMoreRows,
    } = useTableContext();
    const { showToastSuccess } = useToaster();
    const { copy } = useClipboard();
    const { rows } = table.getRowModel();
    const [activeMenu, setActiveMenu] = useState<ActiveMenuState | null>(null);
    const [activeTooltip, setActiveTooltip] =
        useState<ActiveTooltipState | null>(null);
    const tooltipTimerRef = useRef<number | null>(null);

    const rowVirtualizer = useVirtualizer({
        getScrollElement: () => tableContainerRef.current,
        count: rows.length,
        estimateSize: (_index) => ROW_HEIGHT_PX,
        overscan: 25,
    });

    useEffect(() => {
        if (!activeMenu) return;

        const handleKeyDown = getHotkeyHandler([
            [
                'mod+C',
                () => {
                    copy(
                        typeof activeMenu.displayValue === 'string'
                            ? activeMenu.displayValue
                            : JSON.stringify(activeMenu.displayValue),
                    );
                    showToastSuccess({ title: 'Copied to clipboard!' });
                },
            ],
        ]);

        document.body.addEventListener('keydown', handleKeyDown);

        return () => {
            document.body.removeEventListener('keydown', handleKeyDown);
        };
    }, [activeMenu, copy, showToastSuccess]);

    useEffect(() => {
        return () => {
            if (tooltipTimerRef.current !== null) {
                window.clearTimeout(tooltipTimerRef.current);
            }
        };
    }, []);

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

    const clearTooltipTimer = useCallback(() => {
        if (tooltipTimerRef.current !== null) {
            window.clearTimeout(tooltipTimerRef.current);
            tooltipTimerRef.current = null;
        }
    }, []);

    const handleMenuToggle = useCallback(
        (
            cell: Cell<ResultRow, unknown> | Cell<RawResultRow, unknown>,
            bounds: DOMRect,
            displayValue: string | RawResultRow | null,
        ) => {
            clearTooltipTimer();
            setActiveTooltip(null);
            setActiveMenu((current) =>
                current?.cellId === cell.id
                    ? null
                    : {
                          cellId: cell.id,
                          cell,
                          bounds,
                          displayValue,
                      },
            );
        },
        [clearTooltipTimer],
    );

    const handleTooltipShow = useCallback(
        (cellId: string, label: string, bounds: DOMRect) => {
            if (activeMenu) return;

            clearTooltipTimer();
            tooltipTimerRef.current = window.setTimeout(() => {
                setActiveTooltip((current) =>
                    current?.cellId === cellId &&
                    current.label === label &&
                    current.bounds.x === bounds.x &&
                    current.bounds.y === bounds.y
                        ? current
                        : {
                              cellId,
                              label,
                              bounds,
                          },
                );
            }, 500);
        },
        [activeMenu, clearTooltipTimer],
    );

    const handleTooltipHide = useCallback(
        (cellId: string) => {
            clearTooltipTimer();
            setActiveTooltip((current) =>
                current?.cellId === cellId ? null : current,
            );
        },
        [clearTooltipTimer],
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
                              activeMenuCellId={activeMenu?.cellId ?? null}
                              onMenuToggle={handleMenuToggle}
                              onTooltipShow={handleTooltipShow}
                              onTooltipHide={handleTooltipHide}
                          />
                      );
                  })}

            {paddingBottom > 0 && (
                <VirtualizedArea
                    cellCount={cellsCount}
                    padding={paddingBottom}
                />
            )}

            {activeMenu && cellContextMenu ? (
                <CellMenu
                    cell={activeMenu.cell as Cell<ResultRow, ResultRow[0]>}
                    menuItems={cellContextMenu}
                    elementBounds={activeMenu.bounds}
                    onClose={() => setActiveMenu(null)}
                />
            ) : null}

            {activeTooltip && !activeMenu ? (
                <CellTooltip
                    position="top"
                    label={activeTooltip.label}
                    elementBounds={activeTooltip.bounds}
                />
            ) : null}
        </tbody>
    );
};

interface TableBodyProps {
    minimal?: boolean;
    tableContainerRef: React.RefObject<HTMLDivElement | null>;
}

const TableBody: FC<TableBodyProps> = ({ minimal, tableContainerRef }) => {
    return (
        <VirtualizedTableBody
            tableContainerRef={tableContainerRef}
            minimal={minimal}
        />
    );
};

export default TableBody;
