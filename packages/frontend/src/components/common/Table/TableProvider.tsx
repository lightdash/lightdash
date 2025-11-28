import {
    getCoreRowModel,
    getExpandedRowModel,
    useReactTable,
    type ColumnOrderState,
    type GroupingState,
} from '@tanstack/react-table';
import React, { useEffect, useMemo, useState, type FC } from 'react';
import { DEFAULT_PAGE_SIZE, ROW_NUMBER_COLUMN_ID } from './constants';
import Context from './context';
import { getGroupedRowModelLightdash } from './getGroupedRowModelLightdash';
import { type ProviderProps, type TableColumn } from './types';

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

export const TableProvider: FC<React.PropsWithChildren<ProviderProps>> = ({
    hideRowNumbers,
    showColumnCalculation,
    showSubtotals,
    children,
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
    } = rest;
    const [grouping, setGrouping] = useState<GroupingState>([]);
    const [columnVisibility, setColumnVisibility] = useState({});
    const [isInfiniteScrollEnabled, setIsInfiniteScrollEnabled] = useState(
        !pagination?.show || !!pagination?.defaultScroll,
    );

    useEffect(() => {
        setColumnVisibility(calculateColumnVisibility(columns));
    }, [columns]);

    // Derive full column order that includes columns not in columnOrder
    // (e.g., _previous fields for period-over-period comparisons)
    // These should be inserted after their base field
    // Only apply this logic when columnOrder is explicitly provided
    const derivedColumnOrder = useMemo(() => {
        // If no columnOrder provided, preserve old behavior (empty order)
        if (!columnOrder || columnOrder.length === 0) {
            return [];
        }

        const columnIds = columns.map((col) => col.id).filter(Boolean);
        const orderSet = new Set(columnOrder);

        // Find columns not in columnOrder
        const missingColumns = columnIds.filter(
            (id): id is string => id !== undefined && !orderSet.has(id),
        );

        if (missingColumns.length === 0) {
            return columnOrder;
        }

        // Build new order by inserting missing columns after their base field
        const result: string[] = [];
        const insertedMissing = new Set<string>();

        for (const colId of columnOrder) {
            result.push(colId);

            // Check if any missing columns should follow this one
            // (e.g., field_previous should follow field)
            for (const missing of missingColumns) {
                if (insertedMissing.has(missing)) continue;

                // Check if this missing column is a derivative of the current column
                // e.g., orders_total_order_amount_previous follows orders_total_order_amount
                if (missing.startsWith(`${colId}_`)) {
                    result.push(missing);
                    insertedMissing.add(missing);
                }
            }
        }

        // Add any remaining missing columns at the end
        for (const missing of missingColumns) {
            if (!insertedMissing.has(missing)) {
                result.push(missing);
            }
        }

        return result;
    }, [columnOrder, columns]);

    const [tempColumnOrder, setTempColumnOrder] = useState<ColumnOrderState>([
        ROW_NUMBER_COLUMN_ID,
        ...derivedColumnOrder,
    ]);

    useEffect(() => {
        setTempColumnOrder([ROW_NUMBER_COLUMN_ID, ...derivedColumnOrder]);
    }, [derivedColumnOrder]);

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
                    backgroundColor: 'white',
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
                ...rest,
            }}
        >
            {children}
        </Context.Provider>
    );
};
