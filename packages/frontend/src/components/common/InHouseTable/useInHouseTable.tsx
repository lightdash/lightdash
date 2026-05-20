import { Checkbox } from '@mantine-8/core';
import {
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
    type Cell,
    type ColumnOrderState,
    type ColumnDef,
    type OnChangeFn,
    type RowData,
    type RowSelectionState,
    type SortingState,
    type VisibilityState,
} from '@tanstack/react-table';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import classes from './InHouseTable.module.css';
import {
    type InHouseTableColumnDef,
    type InHouseTableHeaderColumn,
    type InHouseTableInstance,
    type InHouseTableOptions,
} from './types';

const EMPTY_VISIBILITY: VisibilityState = {};

const toRenderedValue = (value: unknown): ReactNode => {
    if (value === null || value === undefined) return null;
    if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
    ) {
        return String(value);
    }
    return value as ReactNode;
};

export const useMantineReactTable = useInHouseTable;

const resolveNextState = <TValue,>(
    updater: TValue | ((old: TValue) => TValue),
    previous: TValue,
) =>
    typeof updater === 'function'
        ? (updater as (old: TValue) => TValue)(previous)
        : updater;

const getColumnId = <TData extends RowData>(
    column: InHouseTableColumnDef<TData>,
) => column.id ?? column.accessorKey;

const DEFAULT_COLUMN_SIZE = 180;
const DEFAULT_COLUMN_MIN_SIZE = 40;
const DEFAULT_COLUMN_MAX_SIZE = 1000;
const DEFAULT_DISPLAY_COLUMN_MIN_SIZE = 40;
const ROW_SELECT_COLUMN_ID = 'mrt-row-select';
const ROW_SELECT_COLUMN_MIN_SIZE = 44;

const getDerivedMinSize = (size: number) =>
    Math.max(DEFAULT_COLUMN_MIN_SIZE, Math.min(180, Math.round(size * 0.55)));

const getDataColumnSize = <TData extends RowData>(
    column: InHouseTableColumnDef<TData>,
    defaultColumn?: Partial<InHouseTableColumnDef<TData>>,
) => column.size ?? defaultColumn?.size ?? DEFAULT_COLUMN_SIZE;

const getDataColumnMinSize = <TData extends RowData>(
    column: InHouseTableColumnDef<TData>,
    defaultColumn?: Partial<InHouseTableColumnDef<TData>>,
) =>
    column.minSize ??
    defaultColumn?.minSize ??
    getDerivedMinSize(getDataColumnSize(column, defaultColumn));

const getDataColumnMaxSize = <TData extends RowData>(
    column: InHouseTableColumnDef<TData>,
    defaultColumn?: Partial<InHouseTableColumnDef<TData>>,
) =>
    Math.max(
        column.maxSize ?? defaultColumn?.maxSize ?? DEFAULT_COLUMN_MAX_SIZE,
        getDataColumnSize(column, defaultColumn),
    );

const toTanStackColumn = <TData extends RowData>(
    column: InHouseTableColumnDef<TData>,
    defaultColumn?: Partial<InHouseTableColumnDef<TData>>,
): ColumnDef<TData, unknown> => {
    const childColumns = column.columns?.map((childColumn) =>
        toTanStackColumn(childColumn, defaultColumn),
    );
    const compatHeader = column.header ?? getColumnId(column) ?? '';

    return {
        id: getColumnId(column),
        ...(column.accessorKey ? { accessorKey: column.accessorKey } : {}),
        ...(column.accessorFn ? { accessorFn: column.accessorFn } : {}),
        ...(childColumns ? { columns: childColumns } : {}),
        enableResizing: column.enableResizing,
        enableSorting: column.enableSorting,
        maxSize: getDataColumnMaxSize(column, defaultColumn),
        minSize: getDataColumnMinSize(column, defaultColumn),
        size: getDataColumnSize(column, defaultColumn),
        sortingFn: column.sortingFn,
        meta: {
            ...column.meta,
            lightdashColumnDef: column,
        } as ColumnDef<TData, unknown>['meta'],
        header: (headerContext) => {
            const table = headerContext.table as InHouseTableInstance<TData>;
            const compatColumn = {
                ...headerContext.column,
                columnDef: {
                    ...headerContext.column.columnDef,
                    header: compatHeader,
                },
            } as InHouseTableHeaderColumn<TData>;

            if (column.Header) {
                return column.Header({
                    column: compatColumn,
                    header: headerContext.header,
                    table,
                });
            }

            if (typeof column.header === 'function') {
                return column.header({
                    column: compatColumn,
                    header: headerContext.header,
                    table,
                });
            }

            return compatHeader;
        },
        footer: (footerContext) => {
            const table = footerContext.table as InHouseTableInstance<TData>;

            return column.Footer?.({
                column: footerContext.column,
                header: footerContext.header,
                table,
            });
        },
        cell: (cellContext) => {
            const table = cellContext.table as InHouseTableInstance<TData>;
            const renderedCellValue = toRenderedValue(cellContext.getValue());

            if (column.Cell) {
                return column.Cell({
                    ...cellContext,
                    renderedCellValue,
                    row: cellContext.row,
                    table,
                });
            }

            return renderedCellValue;
        },
    } as ColumnDef<TData, unknown>;
};

const getDisplayColumnSize = <TData extends RowData>(
    displayColumnDefOptions: InHouseTableOptions<TData>['displayColumnDefOptions'],
    defaultDisplayColumn: InHouseTableOptions<TData>['defaultDisplayColumn'],
    columnId: string,
    fallback: number,
) =>
    Math.max(
        displayColumnDefOptions?.[columnId]?.size ??
            defaultDisplayColumn?.size ??
            fallback,
        columnId === ROW_SELECT_COLUMN_ID
            ? ROW_SELECT_COLUMN_MIN_SIZE
            : DEFAULT_DISPLAY_COLUMN_MIN_SIZE,
    );

const getDisplayColumnMinSize = <TData extends RowData>(
    displayColumnDefOptions: InHouseTableOptions<TData>['displayColumnDefOptions'],
    defaultDisplayColumn: InHouseTableOptions<TData>['defaultDisplayColumn'],
    columnId: string,
) =>
    Math.max(
        displayColumnDefOptions?.[columnId]?.minSize ??
            defaultDisplayColumn?.minSize ??
            DEFAULT_DISPLAY_COLUMN_MIN_SIZE,
        columnId === ROW_SELECT_COLUMN_ID ? ROW_SELECT_COLUMN_MIN_SIZE : 0,
    );

const getDisplayColumnMaxSize = <TData extends RowData>(
    displayColumnDefOptions: InHouseTableOptions<TData>['displayColumnDefOptions'],
    defaultDisplayColumn: InHouseTableOptions<TData>['defaultDisplayColumn'],
    columnId: string,
) =>
    Math.max(
        displayColumnDefOptions?.[columnId]?.maxSize ??
            defaultDisplayColumn?.maxSize ??
            DEFAULT_COLUMN_MAX_SIZE,
        getDisplayColumnMinSize(
            displayColumnDefOptions,
            defaultDisplayColumn,
            columnId,
        ),
    );

export const useInHouseTable = <TData extends RowData>(
    options: InHouseTableOptions<TData>,
): InHouseTableInstance<TData> => {
    const [internalSorting, setInternalSorting] = useState<SortingState>(
        options.initialState?.sorting ?? [],
    );
    const [internalGlobalFilter, setInternalGlobalFilter] = useState(
        options.initialState?.globalFilter ?? '',
    );
    const [internalRowSelection, setInternalRowSelection] =
        useState<RowSelectionState>({});
    const [internalColumnOrder, setInternalColumnOrder] =
        useState<ColumnOrderState>(options.initialState?.columnOrder ?? []);
    const [internalColumnVisibility, setInternalColumnVisibility] =
        useState<VisibilityState>(
            options.initialState?.columnVisibility ?? EMPTY_VISIBILITY,
        );
    const [editingCell, setEditingCell] = useState<Cell<TData, unknown> | null>(
        null,
    );
    const tableContainerRef = useRef<HTMLDivElement | null>(null);

    const sorting = options.state?.sorting ?? internalSorting;
    const globalFilter = options.state?.globalFilter ?? internalGlobalFilter;
    const rowSelection = options.state?.rowSelection ?? internalRowSelection;
    const columnOrder = options.state?.columnOrder ?? internalColumnOrder;
    const columnVisibility =
        options.state?.columnVisibility ?? internalColumnVisibility;

    const handleSortingChange: OnChangeFn<SortingState> = useCallback(
        (updater) => {
            if (!options.state?.sorting) {
                setInternalSorting(updater);
            }
            options.onSortingChange?.(updater);
        },
        [options],
    );

    const handleRowSelectionChange: OnChangeFn<RowSelectionState> = useCallback(
        (updater) => {
            if (!options.state?.rowSelection) {
                setInternalRowSelection(updater);
            }
            options.onRowSelectionChange?.(updater);
        },
        [options],
    );

    const handleColumnVisibilityChange: OnChangeFn<VisibilityState> =
        useCallback(
            (updater) => {
                if (!options.state?.columnVisibility) {
                    setInternalColumnVisibility(updater);
                }
                options.onColumnVisibilityChange?.(updater);
            },
            [options],
        );

    const handleColumnOrderChange: OnChangeFn<ColumnOrderState> = useCallback(
        (updater) => {
            if (!options.state?.columnOrder) {
                setInternalColumnOrder(updater);
            }
            options.onColumnOrderChange?.(updater);
        },
        [options],
    );

    const handleGlobalFilterChange = useCallback(
        (updater: string | ((old: string) => string)) => {
            const nextValue = resolveNextState(updater, globalFilter);
            if (options.state?.globalFilter === undefined) {
                setInternalGlobalFilter(nextValue);
            }
            options.onGlobalFilterChange?.(nextValue);
        },
        [globalFilter, options],
    );

    const {
        columns: optionColumns,
        defaultColumn,
        defaultDisplayColumn,
        displayColumnDefOptions,
        enableRowActions,
        enableRowSelection,
        mantineSelectAllCheckboxProps,
        mantineSelectCheckboxProps,
        positionActionsColumn,
        renderRowActions,
    } = options;

    const columns = useMemo<ColumnDef<TData, unknown>[]>(() => {
        const dataColumns = optionColumns.map((column) =>
            toTanStackColumn(column, defaultColumn),
        );
        const leadingDisplayColumns: ColumnDef<TData, unknown>[] = [];
        const trailingDisplayColumns: ColumnDef<TData, unknown>[] = [];

        if (enableRowSelection) {
            leadingDisplayColumns.push({
                id: 'mrt-row-select',
                enableResizing: false,
                enableSorting: false,
                size: getDisplayColumnSize(
                    displayColumnDefOptions,
                    defaultDisplayColumn,
                    'mrt-row-select',
                    60,
                ),
                minSize: getDisplayColumnMinSize(
                    displayColumnDefOptions,
                    defaultDisplayColumn,
                    'mrt-row-select',
                ),
                maxSize: getDisplayColumnMaxSize(
                    displayColumnDefOptions,
                    defaultDisplayColumn,
                    'mrt-row-select',
                ),
                header: ({ table }) => (
                    <div className={classes.rowSelectContent}>
                        <Checkbox
                            aria-label="Select all rows"
                            checked={table.getIsAllRowsSelected()}
                            indeterminate={table.getIsSomeRowsSelected()}
                            onChange={table.getToggleAllRowsSelectedHandler()}
                            onClick={(event) => event.stopPropagation()}
                            {...mantineSelectAllCheckboxProps}
                        />
                    </div>
                ),
                cell: ({ row }) => (
                    <div className={classes.rowSelectContent}>
                        <Checkbox
                            aria-label="Select row"
                            checked={row.getIsSelected()}
                            disabled={!row.getCanSelect()}
                            onChange={row.getToggleSelectedHandler()}
                            onClick={(event) => event.stopPropagation()}
                            {...mantineSelectCheckboxProps}
                        />
                    </div>
                ),
            });
        }

        if (enableRowActions) {
            const actionsHeader =
                displayColumnDefOptions?.['mrt-row-actions']?.header;
            const actionsColumn: ColumnDef<TData, unknown> = {
                id: 'mrt-row-actions',
                enableResizing: false,
                enableSorting: false,
                header: (headerContext) => {
                    if (typeof actionsHeader === 'function') {
                        const compatColumn = {
                            ...headerContext.column,
                            columnDef: {
                                ...headerContext.column.columnDef,
                                header: '',
                            },
                        } as InHouseTableHeaderColumn<TData>;

                        return actionsHeader({
                            column: compatColumn,
                            header: headerContext.header,
                            table: headerContext.table as InHouseTableInstance<TData>,
                        });
                    }
                    return actionsHeader ?? '';
                },
                size: getDisplayColumnSize(
                    displayColumnDefOptions,
                    defaultDisplayColumn,
                    'mrt-row-actions',
                    72,
                ),
                minSize: getDisplayColumnMinSize(
                    displayColumnDefOptions,
                    defaultDisplayColumn,
                    'mrt-row-actions',
                ),
                maxSize: getDisplayColumnMaxSize(
                    displayColumnDefOptions,
                    defaultDisplayColumn,
                    'mrt-row-actions',
                ),
                cell: ({ row, table }) =>
                    renderRowActions?.({
                        row,
                        table: table as InHouseTableInstance<TData>,
                    }) ?? null,
            };

            if (positionActionsColumn === 'first') {
                leadingDisplayColumns.push(actionsColumn);
            } else {
                trailingDisplayColumns.push(actionsColumn);
            }
        }

        return [
            ...leadingDisplayColumns,
            ...dataColumns,
            ...trailingDisplayColumns,
        ];
    }, [
        defaultColumn,
        defaultDisplayColumn,
        displayColumnDefOptions,
        enableRowActions,
        enableRowSelection,
        mantineSelectAllCheckboxProps,
        mantineSelectCheckboxProps,
        optionColumns,
        positionActionsColumn,
        renderRowActions,
    ]);

    const table = useReactTable({
        data: options.data,
        columns,
        columnResizeMode: options.columnResizeMode ?? 'onChange',
        enableColumnResizing: options.enableColumnResizing ?? false,
        enableMultiSort: options.enableMultiSort,
        enableRowSelection: options.enableRowSelection ?? false,
        enableSorting: options.enableSorting ?? true,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel:
            options.manualFiltering === true
                ? undefined
                : getFilteredRowModel(),
        getPaginationRowModel:
            options.enablePagination === false
                ? undefined
                : getPaginationRowModel(),
        getRowId: options.getRowId,
        getSortedRowModel:
            options.manualSorting === true ? undefined : getSortedRowModel(),
        initialState: {
            columnOrder: options.initialState?.columnOrder,
            columnVisibility: options.initialState?.columnVisibility,
            globalFilter: options.initialState?.globalFilter,
            pagination: options.initialState?.pagination,
            sorting: options.initialState?.sorting,
        },
        manualFiltering: options.manualFiltering,
        manualPagination: options.manualPagination,
        manualSorting: options.manualSorting,
        onColumnOrderChange: handleColumnOrderChange,
        onColumnVisibilityChange: handleColumnVisibilityChange,
        onGlobalFilterChange: handleGlobalFilterChange,
        onRowSelectionChange: handleRowSelectionChange,
        onSortingChange: handleSortingChange,
        pageCount: options.pageCount,
        rowCount: options.rowCount,
        state: {
            columnOrder,
            columnVisibility,
            editingCell,
            globalFilter,
            rowSelection,
            showLoadingOverlay: options.state?.showLoadingOverlay ?? false,
            showProgressBars: options.state?.showProgressBars ?? false,
            showSkeletons: options.state?.showSkeletons ?? false,
            sorting,
        } as InHouseTableInstance<TData>['getState'] extends () => infer TState
            ? TState
            : never,
    }) as unknown as InHouseTableInstance<TData>;

    table.lightdashOptions = options;
    table.lightdashState = {
        editingCell:
            editingCell as InHouseTableInstance<TData>['lightdashState']['editingCell'],
        globalFilter,
        isLoading: options.state?.isLoading ?? false,
        showAlertBanner: options.state?.showAlertBanner ?? false,
        showLoadingOverlay: options.state?.showLoadingOverlay ?? false,
        showProgressBars: options.state?.showProgressBars ?? false,
        showSkeletons: options.state?.showSkeletons ?? false,
    };
    table.refs = {
        tableContainerRef,
    };
    table.setEditingCell = setEditingCell;

    return table;
};
