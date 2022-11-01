import { ResultRow } from '@lightdash/common';
import {
    ColumnDef,
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
import { createGlobalStyle } from 'styled-components';
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
    table: Table<ResultRow>;
};

const Context = createContext<TableContext | undefined>(undefined);

const StickyColumnStyle = createGlobalStyle`
  
.sticky-column {
    position: sticky !important;
    left: 1px;
    z-index: 1;
    background-color: white;
}
thead {
    z-index: 2; 
}

.last-sticky-column { /*FIXME :last-of-type doesnt' work*/
    border-right: 2px solid darkgray;

}
  
`;

const rowColumn: TableColumn = {
    id: ROW_NUMBER_COLUMN_ID,
    header: '#',
    cell: (props) => props.row.index + 1,
    footer: 'Total',
    meta: {
        width: 30,
        className: 'sticky-column',
    },
};

export const TableProvider: FC<Props> = ({ children, ...rest }) => {
    const { data, columns, columnOrder, pagination } = rest;
    const [columnVisibility, setColumnVisibility] = useState({});
    const [tempColumnOrder, setTempColumnOrder] = useState<ColumnOrderState>([
        ROW_NUMBER_COLUMN_ID,
        ...(columnOrder || []),
    ]);

    useEffect(() => {
        setTempColumnOrder([ROW_NUMBER_COLUMN_ID, ...(columnOrder || [])]);
    }, [columnOrder]);

    //TODO calculate left for each sticky column
    //TODO configure sticky column on chart options
    //TODO set last-sticky-column :last-type-of doesn't work
    //DONE replace sticky top with a proper fix to avoid overlapping the header
    //TODO should row-number always be fixed ? maybe only if 1 or more columns are fixed
    //TODO fix weird borderless cell
    //TODO pivots ?
    const stickyColumns: (TableColumn | TableHeader)[] = columns
        .slice(0, 1)
        .map((col) => ({
            ...col,
            meta: {
                ...col.meta,
                className: 'sticky-column last-sticky-column',
                style: { left: 30 + 10 },
            },
        }));

    const otherColumns = columns.slice(2);
    const cols = [rowColumn, ...stickyColumns, ...otherColumns];
    const table = useReactTable({
        data,
        columns: cols,
        state: {
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
            <StickyColumnStyle />
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
