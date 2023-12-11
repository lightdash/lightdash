import { ConditionalFormattingConfig, ResultRow } from '@lightdash/common';
import { getHotkeyHandler } from '@mantine/hooks';
import {
    Cell,
    ColumnOrderState,
    getCoreRowModel,
    getPaginationRowModel,
    Table,
    useReactTable,
} from '@tanstack/react-table';
import copy from 'copy-to-clipboard';
import debounce from 'lodash-es/debounce';
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
        showResultsTotal?: boolean;
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

export type TableContext = Props & {
    table: Table<ResultRow>;
    menuPosition:
        | { left: number; top: number; width: number; height: number }
        | undefined;
    selectedCell: Cell<ResultRow, ResultRow[0]> | undefined;
    onSelectCell: (
        cell: Cell<ResultRow, ResultRow[0]>,
        element: HTMLTableCellElement,
    ) => void;
    onDeselectCell: () => void;
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

const calculateColumnVisibility = (columns: Props['columns']) =>
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

export const TableProvider: FC<Props> = ({
    hideRowNumbers,
    showColumnCalculation,
    children,
    ...rest
}) => {
    const { showToastSuccess } = useToaster();
    const { data, columns, columnOrder, pagination } = rest;
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
                } ${hideRowNumbers ? 'first-sticky-column' : ''}`,
                style: {
                    maxWidth: frozenColumnWidth,
                    minWidth: frozenColumnWidth,
                    left: rowColumnWidth + 1 + i * frozenColumnWidth,
                },
            },
        }));
    }, [frozenColumns, frozenColumnWidth, hideRowNumbers, rowColumnWidth]);

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
                className: 'sticky-column first-sticky-column',
                width: rowColumnWidth,
                style: {
                    maxWidth: rowColumnWidth,
                    minWidth: rowColumnWidth,
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
        useState<Cell<ResultRow, ResultRow[0]>>();

    const [menuPosition, setMenuPosition] = useState<{
        left: number;
        top: number;
        width: number;
        height: number;
    }>();

    const handleSelectCell = useCallback(
        (
            cell: Cell<ResultRow, ResultRow[0]>,
            element: HTMLTableCellElement,
        ) => {
            const elementRect = element.getBoundingClientRect();

            setSelectedCell(cell);
            setMenuPosition({
                left: elementRect.x,
                top: elementRect.y,
                width: elementRect.width,
                height: elementRect.height,
            });
        },
        [],
    );

    const handleDeselectCell = useCallback(() => {
        setSelectedCell(undefined);
        setMenuPosition(undefined);
    }, []);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const handleDebouncedCellSelect = useCallback(
        debounce(handleSelectCell, 300, {
            leading: true,
            trailing: false,
        }),
        [handleSelectCell],
    );

    const [copyingCellId, setCopyingCellId] = useState<string>();

    const onCopyCell = useCallback(() => {
        if (!selectedCell) return;

        const value = selectedCell.getValue().value;

        copy(value.formatted);

        showToastSuccess({ title: 'Copied to clipboard!' });

        setCopyingCellId((cellId) => {
            if (cellId) return;
            setTimeout(() => setCopyingCellId(undefined), 300);
            return selectedCell.id;
        });
    }, [selectedCell, showToastSuccess]);

    useEffect(() => {
        const handleKeyDown = getHotkeyHandler([['mod+C', onCopyCell]]);
        if (selectedCell) {
            document.body.addEventListener('keydown', handleKeyDown);
        }

        return () => {
            document.body.removeEventListener('keydown', handleKeyDown);
        };
    }, [onCopyCell, selectedCell]);

    return (
        <Context.Provider
            value={{
                table,
                selectedCell,
                menuPosition,
                onSelectCell: handleDebouncedCellSelect,
                onDeselectCell: handleDeselectCell,
                copyingCellId: copyingCellId,
                onCopyCell,
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
