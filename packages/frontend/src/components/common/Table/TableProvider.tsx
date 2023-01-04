import { HotkeyConfig, useHotkeys } from '@blueprintjs/core';
import { ConditionalFormattingConfig, ResultRow } from '@lightdash/common';
import {
    Cell,
    ColumnOrderState,
    getCoreRowModel,
    getPaginationRowModel,
    Table,
    useReactTable,
} from '@tanstack/react-table';
import copy from 'copy-to-clipboard';
import { debounce } from 'lodash-es';
import React, {
    createContext,
    FC,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react';
import useToaster from '../../../hooks/toaster/useToaster';
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
    hideRowNumbers?: boolean;
    showColumnCalculation?: boolean;
    conditionalFormattings?: ConditionalFormattingConfig[];
    footer?: {
        show?: boolean;
    };
    columnOrder?: string[];
    onColumnOrderChange?: (value: string[]) => void;
};

type TableContext = Props & {
    table: Table<ResultRow>;
    selectedCell: Cell<ResultRow, unknown> | undefined;
    onSelectCell: (cell: Cell<ResultRow, unknown> | undefined) => void;
    copyingCellId: string | undefined;
    onCopyCell: React.KeyboardEventHandler<HTMLElement>;
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

export const TableProvider: FC<Props> = ({
    hideRowNumbers,
    showColumnCalculation,
    children,
    ...rest
}) => {
    const { showToastSuccess } = useToaster();
    const { data, columns, columnOrder, pagination } = rest;
    const [columnVisibility, setColumnVisibility] = useState({});
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
    const frozenColumns = columns.filter((col) => col.meta?.frozen);
    const frozenColumnWidth = 100; // TODO this should be dynamic
    const stickyColumns = frozenColumns.map((col, i) => ({
        ...col,
        meta: {
            ...col.meta,
            className: `sticky-column ${
                i === frozenColumns.length - 1 ? 'last-sticky-column' : ''
            } ${hideRowNumbers ? 'first-sticky-column' : ''}`,
            style: {
                maxWidth: frozenColumnWidth,
                minWidth: frozenColumnWidth,
                left: rowColumnWidth + 1 + i * frozenColumnWidth,
            },
        },
    }));

    const otherColumns = columns.filter((col) => !col.meta?.frozen);
    const stickyRowColumn =
        stickyColumns.length > 0
            ? {
                  ...rowColumn,
                  meta: {
                      ...rowColumn.meta,
                      className: 'sticky-column first-sticky-column',
                      width: rowColumnWidth,
                      style: {
                          maxWidth: rowColumnWidth,
                          minWidth: rowColumnWidth,
                      },
                  },
              }
            : rowColumn;

    const visibleColumns = hideRowNumbers
        ? [...stickyColumns, ...otherColumns]
        : [stickyRowColumn, ...stickyColumns, ...otherColumns];

    const table = useReactTable({
        data,
        columns: visibleColumns,
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

    const [selectedCell, setSelectedCell] =
        useState<Cell<ResultRow, unknown>>();

    const handleSelectCell = useCallback(
        (cell: Cell<ResultRow, unknown> | undefined) => {
            setSelectedCell(cell);
        },
        [],
    );

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const handleDebouncedCellSelect = useCallback(
        debounce(handleSelectCell, 300, {
            leading: true,
            trailing: false,
        }),
        [handleSelectCell],
    );

    const [copyingCellId, setCopyingCellId] = useState<string>();

    const hotkeys = useMemo<HotkeyConfig[]>(
        () => [
            {
                label: 'Copy value from the select cell',
                combo: 'mod+c',
                global: true,
                disabled: !selectedCell,
                onKeyDown: () => {
                    if (!selectedCell) return;

                    const value = (selectedCell.getValue() as ResultRow[0])
                        .value;

                    copy(value.formatted);

                    showToastSuccess({ title: 'Copied to clipboard!' });

                    setCopyingCellId((cellId) => {
                        if (cellId) return;
                        setTimeout(() => setCopyingCellId(undefined), 300);
                        return selectedCell.id;
                    });
                },
            },
        ],
        [selectedCell],
    );

    const { handleKeyDown } = useHotkeys(hotkeys);

    return (
        <Context.Provider
            value={{
                table,
                selectedCell,
                onSelectCell: handleDebouncedCellSelect,
                copyingCellId: copyingCellId,
                onCopyCell: handleKeyDown,
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
