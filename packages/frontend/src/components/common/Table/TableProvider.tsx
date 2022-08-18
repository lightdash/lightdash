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
    useRef,
    useState,
} from 'react';
import {
    CellContextMenuProps,
    DEFAULT_PAGE_SIZE,
    HeaderProps,
    MAX_PAGE_SIZE,
    ROW_NUMBER_COLUMN_ID,
    TableColumn,
} from './types';

type Props = {
    data: ResultRow[];
    columns: TableColumn[];
    headerContextMenu?: FC<HeaderProps>;
    headerButton?: FC<HeaderProps>;
    cellContextMenu?: FC<CellContextMenuProps>;
    pagination?: {
        show?: boolean;
    };
    footer?: {
        show?: boolean;
    };
    columnOrder?: string[];
    onColumnOrderChange?: (value: string[]) => void;
};

type TableContext = Props & {
    tableWrapperRef: React.MutableRefObject<HTMLDivElement | null>;
    setTableWrapperRef: (instance: HTMLDivElement | null) => void;
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
    const tableWrapperRef = useRef<HTMLDivElement | null>(null);
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
        setPageSize(pagination?.show ? DEFAULT_PAGE_SIZE : MAX_PAGE_SIZE);
    }, [pagination, setPageSize]);

    const setTableWrapperRef = (instance: HTMLDivElement | null) => {
        tableWrapperRef.current = instance;
    };

    return (
        <Context.Provider
            value={{
                table,
                tableWrapperRef,
                setTableWrapperRef,
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
