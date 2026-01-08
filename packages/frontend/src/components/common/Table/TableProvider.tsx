import {
    getCoreRowModel,
    getExpandedRowModel,
    useReactTable,
    type ColumnOrderState,
    type GroupingState,
} from '@tanstack/react-table';
import React, { useEffect, useMemo, useState, type FC } from 'react';
import {
    DEFAULT_PAGE_SIZE,
    FROZEN_COLUMN_BACKGROUND,
    ROW_NUMBER_COLUMN_ID,
} from './constants';
import Context from './context';
import { getGroupedRowModelLightdash } from './getGroupedRowModelLightdash';
import {
    type ColumnSizingContext,
    type ProviderProps,
    type TableColumn,
} from './types';
import { useColumnSizing } from './useColumnSizing';

const rowColumn: TableColumn = {
    id: ROW_NUMBER_COLUMN_ID,
    header: '#',
    cell: (props) => {
        const { pageIndex, pageSize } = props.table.getState().pagination;
        const pageStartIndex = pageIndex * pageSize;
        return pageStartIndex + props.row.index + 1;
    },
    footer: 'Total',
    meta: {
        width: 30,
    },
    enableGrouping: false,
};

const calculateColumnVisibility = (columns: ProviderProps['columns']) =>
    columns.reduce(
        (acc, c) => ({
            ...acc,
            ...(c.id && {
                [c.id]:
                    c.meta && 'isVisible' in c.meta ? c.meta?.isVisible : true,
            }),
        }),
        {},
    );

interface TableProviderInternalProps extends ProviderProps {
    /** Container width in pixels, for column sizing calculations */
    containerWidth?: number;
}

export const TableProvider: FC<
    React.PropsWithChildren<TableProviderInternalProps>
> = ({
    hideRowNumbers,
    showColumnCalculation,
    showSubtotals,
    children,
    containerWidth = 800,
    ...rest
}) => {
    const {
        data,
        totalRowsCount,
        columns,
        columnOrder,
        fetchMoreRows,
        pagination,
        columnProperties,
        minMaxMap,
        onColumnWidthChange,
        enableColumnResizing = false,
    } = rest;
    const [grouping, setGrouping] = useState<GroupingState>([]);
    const [columnVisibility, setColumnVisibility] = useState({});
    const [isInfiniteScrollEnabled, setIsInfiniteScrollEnabled] = useState(
        !pagination?.show || !!pagination?.defaultScroll,
    );

    useEffect(() => {
        setColumnVisibility(calculateColumnVisibility(columns));
    }, [columns]);

    const [tempColumnOrder, setTempColumnOrder] = useState<ColumnOrderState>([
        ROW_NUMBER_COLUMN_ID,
        ...(columnOrder || []),
    ]);

    useEffect(() => {
        setTempColumnOrder([ROW_NUMBER_COLUMN_ID, ...(columnOrder || [])]);
    }, [columnOrder]);

    const withTotals = showColumnCalculation ? 60 : 0;
    const rowColumnWidth = hideRowNumbers
        ? 0
        : Math.max(withTotals, `${data.length}`.length * 10 + 20);
    const frozenColumns = useMemo(
        () => columns.filter((col) => col.meta?.frozen),
        [columns],
    );
    const frozenColumnWidth = 100; // TODO this should be dynamic
    const stickyColumns = useMemo(() => {
        return frozenColumns.map((col, i) => ({
            ...col,
            meta: {
                ...col.meta,
                className: `sticky-column ${
                    i === frozenColumns.length - 1 ? 'last-sticky-column' : ''
                }`,
                style: {
                    maxWidth: frozenColumnWidth,
                    minWidth: frozenColumnWidth,
                    left: rowColumnWidth + i * frozenColumnWidth,
                },
            },
        }));
    }, [frozenColumns, frozenColumnWidth, rowColumnWidth]);

    const otherColumns = useMemo(
        () => columns.filter((col) => !col.meta?.frozen),
        [columns],
    );
    const stickyRowColumn = useMemo(() => {
        if (stickyColumns.length === 0) return rowColumn;

        return {
            ...rowColumn,
            meta: {
                ...rowColumn.meta,
                className: 'sticky-column',
                width: rowColumnWidth,
                style: {
                    maxWidth: rowColumnWidth,
                    minWidth: rowColumnWidth,
                    backgroundColor: FROZEN_COLUMN_BACKGROUND,
                },
            },
        };
    }, [stickyColumns, rowColumnWidth]);

    const visibleColumns = useMemo(() => {
        return hideRowNumbers
            ? [...stickyColumns, ...otherColumns]
            : [stickyRowColumn, ...stickyColumns, ...otherColumns];
    }, [hideRowNumbers, stickyColumns, otherColumns, stickyRowColumn]);

    const [paginationState, setPagination] = useState({
        pageIndex: 0,
        pageSize: DEFAULT_PAGE_SIZE,
    });
    useEffect(() => {
        // Fetch rows for next pages
        const pageThreshold = 2;
        const { pageIndex, pageSize } = paginationState;
        const currentPageRowCount = pageIndex * pageSize;
        const nextPagesRowCount =
            currentPageRowCount + pageSize * pageThreshold;
        if (data.length < nextPagesRowCount) {
            fetchMoreRows();
        }
    }, [data.length, fetchMoreRows, paginationState]);

    const pageRows = useMemo(() => {
        // calculate page rows from data and pagination state
        const { pageIndex, pageSize } = paginationState;
        const start = pageIndex * pageSize;
        const end = start + pageSize;
        return data.slice(start, end);
    }, [data, paginationState]);

    // Get column IDs for sizing calculations (excluding row number column which has fixed width)
    const sizableColumnIds = useMemo(() => {
        return visibleColumns
            .filter(
                (col) => col.id !== ROW_NUMBER_COLUMN_ID && !col.meta?.frozen,
            )
            .map((col) => col.id)
            .filter((id): id is string => id !== undefined);
    }, [visibleColumns]);

    // Calculate the width available for sizable columns
    const frozenTotalWidth = useMemo(() => {
        const rowNumWidth = hideRowNumbers ? 0 : rowColumnWidth;
        const frozenWidth = stickyColumns.length * frozenColumnWidth;
        return rowNumWidth + frozenWidth;
    }, [
        hideRowNumbers,
        rowColumnWidth,
        stickyColumns.length,
        frozenColumnWidth,
    ]);

    const sizableContainerWidth = Math.max(
        0,
        containerWidth - frozenTotalWidth,
    );

    const columnSizingResult = useColumnSizing({
        containerWidth: sizableContainerWidth,
        columnIds: sizableColumnIds,
        columnProperties,
        onColumnWidthChange,
    });

    // Build column sizing context
    const columnSizing: ColumnSizingContext = useMemo(
        () => ({
            enabled: enableColumnResizing,
            isReady: containerWidth > 0,
            hasLockedWidths: columnSizingResult.hasLockedWidths,
            columnWidths: columnSizingResult.columnWidths,
            frozenTotalWidth,
            needsHorizontalScroll: columnSizingResult.needsHorizontalScroll,
            startResize: columnSizingResult.startResize,
            updateResize: columnSizingResult.updateResize,
            endResize: columnSizingResult.endResize,
            resetColumnWidth: columnSizingResult.resetColumnWidth,
            resetAllColumnWidths: columnSizingResult.resetAllColumnWidths,
            isColumnLocked: columnSizingResult.isColumnLocked,
            resizingColumnId: columnSizingResult.resizeState?.columnId ?? null,
            hadLockedWidthsBeforeResize:
                columnSizingResult.resizeState?.hadLockedWidthsBefore ?? false,
        }),
        [
            columnSizingResult,
            enableColumnResizing,
            frozenTotalWidth,
            containerWidth,
        ],
    );

    const table = useReactTable({
        data: isInfiniteScrollEnabled ? data : pageRows,
        columns: visibleColumns,
        state: {
            grouping,
            columnVisibility,
            columnOrder: tempColumnOrder,
            columnPinning: {
                left: [
                    ROW_NUMBER_COLUMN_ID,
                    ...stickyColumns.map((c) => c.id || ''),
                ],
            },
            pagination: paginationState,
        },
        meta: {
            columnProperties,
            minMaxMap,
        },
        enableColumnPinning: true,
        onColumnVisibilityChange: setColumnVisibility,
        onColumnOrderChange: setTempColumnOrder,
        getCoreRowModel: getCoreRowModel(),
        manualPagination: true,
        rowCount: totalRowsCount,
        pageCount: Math.ceil(totalRowsCount / paginationState.pageSize),
        onPaginationChange: setPagination,
        onGroupingChange: setGrouping,
        groupedColumnMode: false,
        getExpandedRowModel: getExpandedRowModel(),
        getGroupedRowModel: getGroupedRowModelLightdash(),
    });

    return (
        <Context.Provider
            value={{
                table,
                isInfiniteScrollEnabled,
                setIsInfiniteScrollEnabled,
                columnSizing,
                ...rest,
            }}
        >
            {children}
        </Context.Provider>
    );
};
