import {
    getCoreRowModel,
    getExpandedRowModel,
    getPaginationRowModel,
    useReactTable,
    type ColumnOrderState,
    type GroupingState,
} from '@tanstack/react-table';
import React, { useEffect, useMemo, useState, type FC } from 'react';
import {
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    ROW_NUMBER_COLUMN_ID,
} from './constants';
import Context from './context';
import { getGroupedRowModelLightdash } from './getGroupedRowModelLightdash';
import { type ProviderProps, type TableColumn } from './types';

const rowColumn: TableColumn = {
    id: ROW_NUMBER_COLUMN_ID,
    header: '#',
    cell: (props) => props.row.index + 1,
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
    const { data, columns, columnOrder, pagination } = rest;
    const [grouping, setGrouping] = useState<GroupingState>([]);
    const [columnVisibility, setColumnVisibility] = useState({});

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
                    left: rowColumnWidth + 1 + i * frozenColumnWidth,
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

    const table = useReactTable({
        data,
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
        },
        enablePinning: true,
        onColumnVisibilityChange: setColumnVisibility,
        onColumnOrderChange: setTempColumnOrder,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        onGroupingChange: setGrouping,
        groupedColumnMode: false,
        getExpandedRowModel: getExpandedRowModel(),
        getGroupedRowModel: getGroupedRowModelLightdash(),
    });

    const { setPageSize } = table;
    useEffect(() => {
        if (pagination?.show) {
            setPageSize(
                pagination?.defaultScroll ? MAX_PAGE_SIZE : DEFAULT_PAGE_SIZE,
            );
        } else {
            setPageSize(MAX_PAGE_SIZE);
        }
    }, [pagination, setPageSize]);

    return (
        <Context.Provider value={{ table, ...rest }}>
            {children}
        </Context.Provider>
    );
};
