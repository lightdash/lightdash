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
    HeaderProps,
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
    columnOrder: string[];
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
    const { data, columns, columnOrder, onColumnOrderChange } = rest;
    const [columnVisibility, setColumnVisibility] = React.useState({});
    const [tempColumnOrder, setTempColumnOrder] =
        React.useState<ColumnOrderState>(columnOrder);
    const table = useReactTable({
        data,
        columns: [rowColumn, ...columns],
        state: {
            columnVisibility,
            columnOrder: [
                ...new Set([ROW_NUMBER_COLUMN_ID, ...tempColumnOrder]),
            ],
        },
        onColumnVisibilityChange: setColumnVisibility,
        onColumnOrderChange: setTempColumnOrder,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
    });
    useEffect(() => {
        onColumnOrderChange?.(tempColumnOrder);
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
