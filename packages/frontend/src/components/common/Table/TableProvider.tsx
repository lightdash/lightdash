import {
    ColumnOrderState,
    getCoreRowModel,
    getPaginationRowModel,
    Table,
    useReactTable,
} from '@tanstack/react-table';
import React, { createContext, FC, useContext, useEffect } from 'react';
import {
    CellContextMenuProps,
    DEFAULT_PAGE_SIZE,
    HeaderProps,
    MAX_PAGE_SIZE,
    ROW_NUMBER_COLUMN_ID,
    TableColumn,
    TableRow,
} from './types';

type Props = {
    data: TableRow[];
    columns: TableColumn[];
    headerContextMenu?: FC<HeaderProps>;
    headerButton?: FC<HeaderProps>;
    cellContextMenu?: FC<CellContextMenuProps>;
    pagination?: {
        show?: boolean;
    };
    columnOrder?: string[];
    onColumnOrderChange?: (value: string[]) => void;
};

type TableContext = Props & {
    table: Table<TableRow>;
};

const Context = createContext<TableContext | undefined>(undefined);

const rowColumn: TableColumn = {
    id: ROW_NUMBER_COLUMN_ID,
    header: '#',
    cell: (props) => props.row.index + 1,
    footer: 'Total',
    meta: {
        width: 30,
    },
};

export const TableProvider: FC<Props> = ({ children, ...rest }) => {
    const { data, columns, columnOrder, pagination, onColumnOrderChange } =
        rest;
    const [columnVisibility, setColumnVisibility] = React.useState({});
    const allColumnIds = columns.reduce<string[]>(
        (acc, col) => (col.id ? [...acc, col.id] : acc),
        [],
    );
    const [tempColumnOrder, setTempColumnOrder] =
        React.useState<ColumnOrderState>(columnOrder || []);
    const table = useReactTable({
        data,
        columns: [rowColumn, ...columns],
        state: {
            columnVisibility,
            columnOrder: [
                ...new Set([
                    ROW_NUMBER_COLUMN_ID,
                    ...(columnOrder || []),
                    ...allColumnIds,
                ]),
            ],
        },
        onColumnVisibilityChange: setColumnVisibility,
        onColumnOrderChange: setTempColumnOrder,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
    });
    const { setPageSize } = table;
    useEffect(() => {
        setPageSize(pagination?.show ? DEFAULT_PAGE_SIZE : MAX_PAGE_SIZE);
    }, [pagination, setPageSize]);
    useEffect(() => {
        onColumnOrderChange?.(
            tempColumnOrder.filter((value) => value !== ROW_NUMBER_COLUMN_ID),
        );
    }, [tempColumnOrder, onColumnOrderChange]);
    return (
        <Context.Provider
            value={{
                table,
                ...rest,
            }}
        >
            {children}
        </Context.Provider>
    );
};

export function useTableContext(): TableContext {
    const context = useContext(Context);
    if (context === undefined) {
        throw new Error('useTableContext must be used within a TableProvider');
    }
    return context;
}
