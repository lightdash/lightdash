import { ResultRow } from '@lightdash/common';
import {
    ColumnOrderState,
    getCoreRowModel,
    getPaginationRowModel,
    Table,
    useReactTable,
} from '@tanstack/react-table';
import React, {
    createContext,
    FC,
    useContext,
    useEffect,
    useState,
} from 'react';
import {
    CellContextMenuProps,
    DEFAULT_PAGE_SIZE,
    HeaderProps,
    MAX_PAGE_SIZE,
    ROW_NUMBER_COLUMN_ID,
    TableColumn,
    TableHeader,
} from './types';

type Props = {
    data: ResultRow[];
    columns: Array<TableColumn | TableHeader>;
    headerContextMenu?: FC<HeaderProps>;
    headerButton?: FC<HeaderProps>;
    cellContextMenu?: FC<CellContextMenuProps>;
    pagination?: {
        show?: boolean;
        defaultScroll?: boolean;
    };
    footer?: {
        show?: boolean;
    };
    columnOrder?: string[];
    onColumnOrderChange?: (value: string[]) => void;
};

type TableContext = Props & {
    isScrollable: boolean;
    setIsScrollable: React.Dispatch<React.SetStateAction<boolean>>;
    table: Table<ResultRow>;
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
    const { data, columns, columnOrder, pagination } = rest;
    const [columnVisibility, setColumnVisibility] = useState({});
    const [isScrollable, setIsScrollable] = useState(true);
    const [tempColumnOrder, setTempColumnOrder] = useState<ColumnOrderState>([
        ROW_NUMBER_COLUMN_ID,
        ...(columnOrder || []),
    ]);

    useEffect(() => {
        setTempColumnOrder([ROW_NUMBER_COLUMN_ID, ...(columnOrder || [])]);
    }, [columnOrder]);

    const table = useReactTable({
        data,
        columns: [rowColumn, ...columns],
        state: {
            columnVisibility,
            columnOrder: tempColumnOrder,
        },
        onColumnVisibilityChange: setColumnVisibility,
        onColumnOrderChange: setTempColumnOrder,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
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
        <Context.Provider
            value={{
                table,
                isScrollable,
                setIsScrollable,
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
