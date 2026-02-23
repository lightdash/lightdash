import {
    getCoreRowModel,
    getExpandedRowModel,
    useReactTable,
    type ColumnOrderState,
    type GroupingState,
} from '@tanstack/react-table';
import React, { useEffect, useMemo, useState, type FC } from 'react';
import { useIsTableColumnWidthStabilizationEnabled } from '../../../hooks/useIsTableColumnWidthStabilizationEnabled';
import {
    DEFAULT_PAGE_SIZE,
    FROZEN_COLUMN_BACKGROUND,
    ROW_NUMBER_COLUMN_ID,
} from './constants';
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
    const isTableColumnWidthStabilizationEnabled =
        useIsTableColumnWidthStabilizationEnabled();

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
    const effectiveRowColumnWidth = isTableColumnWidthStabilizationEnabled
        ? Math.max(rowColumnWidth, 50)
        : rowColumnWidth;
    const frozenColumns = useMemo(
        () => columns.filter((col) => col.meta?.frozen),
        [columns],
    );
    const defaultFrozenColumnWidth = 100;
    const stickyColumns = useMemo(() => {
        let cumulativeLeft = effectiveRowColumnWidth;
        return frozenColumns.map((col, i) => {
            const colWidth = col.meta?.width ?? defaultFrozenColumnWidth;
            const left = cumulativeLeft;
            cumulativeLeft += colWidth;
            return {
                ...col,
                meta: {
                    ...col.meta,
                    className: `sticky-column ${
                        i === frozenColumns.length - 1
                            ? 'last-sticky-column'
                            : ''
                    }`,
                    style: {
                        maxWidth: colWidth,
                        minWidth: colWidth,
                        left,
                    },
                },
            };
        });
    }, [frozenColumns, effectiveRowColumnWidth]);

    const otherColumns = useMemo(
        () => columns.filter((col) => !col.meta?.frozen),
        [columns],
    );
    const stickyRowColumn = useMemo(() => {
        if (stickyColumns.length === 0) {
            if (!isTableColumnWidthStabilizationEnabled) {
                return rowColumn;
            }

            return {
                ...rowColumn,
                meta: {
                    ...rowColumn.meta,
                    width: effectiveRowColumnWidth,
                    style: {
                        width: effectiveRowColumnWidth,
                        minWidth: effectiveRowColumnWidth,
                        maxWidth: effectiveRowColumnWidth,
                    },
                },
            };
        }

        return {
            ...rowColumn,
            meta: {
                ...rowColumn.meta,
                className: 'sticky-column',
                width: effectiveRowColumnWidth,
                style: {
                    ...(isTableColumnWidthStabilizationEnabled
                        ? {
                              width: effectiveRowColumnWidth,
                          }
                        : {}),
                    maxWidth: effectiveRowColumnWidth,
                    minWidth: effectiveRowColumnWidth,
                    backgroundColor: FROZEN_COLUMN_BACKGROUND,
                },
            },
        };
    }, [
        stickyColumns,
        effectiveRowColumnWidth,
        isTableColumnWidthStabilizationEnabled,
    ]);

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
