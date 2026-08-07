import { Checkbox } from '@mantine/core';
import {
    useTable,
    type Cell,
    type ColumnOrderState,
    type ColumnDef,
    type OnChangeFn,
    type RowData,
    type ColumnVisibilityState as VisibilityState,
    type RowSelectionState,
    type SortingState,
} from '@tanstack/react-table';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import classes from './ContentTable.module.css';
import { contentTableFeatures, type ContentTableFeatures } from './features';
import {
    type ContentTableColumnDef,
    type ContentTableHeaderColumn,
    type ContentTableInstance,
    type ContentTableOptions,
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

const resolveNextState = <TValue,>(
    updater: TValue | ((old: TValue) => TValue),
    previous: TValue,
) =>
    typeof updater === 'function'
        ? (updater as (old: TValue) => TValue)(previous)
        : updater;

const getColumnId = <TData extends RowData>(
    column: ContentTableColumnDef<TData>,
) =>
    column.id ??
    column.accessorKey ??
    (typeof column.header === 'string' ? column.header : undefined);

const DEFAULT_COLUMN_SIZE = 180;
const DEFAULT_COLUMN_MIN_SIZE = 40;
const DEFAULT_COLUMN_MAX_SIZE = 1000;
const DEFAULT_DISPLAY_COLUMN_MIN_SIZE = 40;
const ROW_SELECT_COLUMN_ID = 'content-table-row-select';
const ROW_SELECT_COLUMN_MIN_SIZE = 44;

const getDerivedMinSize = (size: number) =>
    Math.max(DEFAULT_COLUMN_MIN_SIZE, Math.min(180, Math.round(size * 0.55)));

const getDataColumnSize = <TData extends RowData>(
    column: ContentTableColumnDef<TData>,
    defaultColumn?: Partial<ContentTableColumnDef<TData>>,
) => column.size ?? defaultColumn?.size ?? DEFAULT_COLUMN_SIZE;

const getDataColumnMinSize = <TData extends RowData>(
    column: ContentTableColumnDef<TData>,
    defaultColumn?: Partial<ContentTableColumnDef<TData>>,
) =>
    column.minSize ??
    defaultColumn?.minSize ??
    getDerivedMinSize(getDataColumnSize(column, defaultColumn));

const getDataColumnMaxSize = <TData extends RowData>(
    column: ContentTableColumnDef<TData>,
    defaultColumn?: Partial<ContentTableColumnDef<TData>>,
) =>
    Math.max(
        column.maxSize ?? defaultColumn?.maxSize ?? DEFAULT_COLUMN_MAX_SIZE,
        getDataColumnSize(column, defaultColumn),
    );

const toTanStackColumn = <TData extends RowData>(
    column: ContentTableColumnDef<TData>,
    defaultColumn?: Partial<ContentTableColumnDef<TData>>,
): ColumnDef<ContentTableFeatures, TData, unknown> => {
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
        ...(column.sortingFn ? { sortFn: column.sortingFn } : {}),
        meta: {
            ...column.meta,
            lightdashColumnDef: column,
        } as ColumnDef<ContentTableFeatures, TData, unknown>['meta'],
        header: (headerContext) => {
            const table = headerContext.table as ContentTableInstance<TData>;
            const compatColumn = {
                ...headerContext.column,
                columnDef: {
                    ...headerContext.column.columnDef,
                    header: compatHeader,
                },
            } as ContentTableHeaderColumn<TData>;

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
        ...(column.Footer
            ? {
                  footer: (footerContext) => {
                      const table =
                          footerContext.table as ContentTableInstance<TData>;

                      return column.Footer?.({
                          column: footerContext.column,
                          header: footerContext.header,
                          table,
                      });
                  },
              }
            : {}),
        cell: (cellContext) => {
            const table = cellContext.table as ContentTableInstance<TData>;
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
    } as ColumnDef<ContentTableFeatures, TData, unknown>;
};

const getDisplayColumnSize = <TData extends RowData>(
    displayColumnDefOptions: ContentTableOptions<TData>['displayColumnDefOptions'],
    defaultDisplayColumn: ContentTableOptions<TData>['defaultDisplayColumn'],
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
    displayColumnDefOptions: ContentTableOptions<TData>['displayColumnDefOptions'],
    defaultDisplayColumn: ContentTableOptions<TData>['defaultDisplayColumn'],
    columnId: string,
) =>
    Math.max(
        displayColumnDefOptions?.[columnId]?.minSize ??
            defaultDisplayColumn?.minSize ??
            DEFAULT_DISPLAY_COLUMN_MIN_SIZE,
        columnId === ROW_SELECT_COLUMN_ID ? ROW_SELECT_COLUMN_MIN_SIZE : 0,
    );

const getDisplayColumnMaxSize = <TData extends RowData>(
    displayColumnDefOptions: ContentTableOptions<TData>['displayColumnDefOptions'],
    defaultDisplayColumn: ContentTableOptions<TData>['defaultDisplayColumn'],
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

export const useContentTable = <TData extends RowData>(
    options: ContentTableOptions<TData>,
): ContentTableInstance<TData> => {
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
    const [editingCell, setEditingCell] = useState<Cell<
        ContentTableFeatures,
        TData,
        unknown
    > | null>(null);
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

    const columns = useMemo<
        ColumnDef<ContentTableFeatures, TData, unknown>[]
    >(() => {
        const dataColumns = optionColumns.map((column) =>
            toTanStackColumn(column, defaultColumn),
        );
        const leadingDisplayColumns: ColumnDef<
            ContentTableFeatures,
            TData,
            unknown
        >[] = [];
        const trailingDisplayColumns: ColumnDef<
            ContentTableFeatures,
            TData,
            unknown
        >[] = [];

        if (enableRowSelection) {
            leadingDisplayColumns.push({
                id: 'content-table-row-select',
                enableResizing: false,
                enableSorting: false,
                size: getDisplayColumnSize(
                    displayColumnDefOptions,
                    defaultDisplayColumn,
                    'content-table-row-select',
                    60,
                ),
                minSize: getDisplayColumnMinSize(
                    displayColumnDefOptions,
                    defaultDisplayColumn,
                    'content-table-row-select',
                ),
                maxSize: getDisplayColumnMaxSize(
                    displayColumnDefOptions,
                    defaultDisplayColumn,
                    'content-table-row-select',
                ),
                header: ({ table }) => (
                    <div className={classes.rowSelectContent}>
                        <Checkbox
                            aria-label="Select all rows"
                            checked={table.getIsAllRowsSelected()}
                            // v9: getIsSomeRowsSelected() means "at least one",
                            // including the all-selected case
                            indeterminate={
                                table.getIsSomeRowsSelected() &&
                                !table.getIsAllRowsSelected()
                            }
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
                displayColumnDefOptions?.['content-table-row-actions']?.header;
            const actionsColumn: ColumnDef<
                ContentTableFeatures,
                TData,
                unknown
            > = {
                id: 'content-table-row-actions',
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
                        } as ContentTableHeaderColumn<TData>;

                        return actionsHeader({
                            column: compatColumn,
                            header: headerContext.header,
                            table: headerContext.table as ContentTableInstance<TData>,
                        });
                    }
                    return actionsHeader ?? '';
                },
                size: getDisplayColumnSize(
                    displayColumnDefOptions,
                    defaultDisplayColumn,
                    'content-table-row-actions',
                    72,
                ),
                minSize: getDisplayColumnMinSize(
                    displayColumnDefOptions,
                    defaultDisplayColumn,
                    'content-table-row-actions',
                ),
                maxSize: getDisplayColumnMaxSize(
                    displayColumnDefOptions,
                    defaultDisplayColumn,
                    'content-table-row-actions',
                ),
                cell: ({ row, table }) =>
                    renderRowActions?.({
                        row,
                        table: table as ContentTableInstance<TData>,
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

    const rawReactTable = useTable<ContentTableFeatures, TData>({
        features: contentTableFeatures,
        data: options.data,
        columns,
        columnResizeMode: options.columnResizeMode ?? 'onChange',
        enableColumnResizing: options.enableColumnResizing ?? false,
        enableMultiSort: options.enableMultiSort,
        enableRowSelection: options.enableRowSelection ?? false,
        enableSorting: options.enableSorting ?? true,
        getRowId: options.getRowId,
        initialState: {
            columnOrder: options.initialState?.columnOrder,
            columnVisibility: options.initialState?.columnVisibility,
            globalFilter: options.initialState?.globalFilter,
            pagination: options.initialState?.pagination
                ? {
                      pageIndex: options.initialState.pagination.pageIndex ?? 0,
                      pageSize: options.initialState.pagination.pageSize ?? 10,
                  }
                : undefined,
            sorting: options.initialState?.sorting,
        },
        manualFiltering: options.manualFiltering,
        // Row models are always registered in v9; enablePagination: false is
        // emulated by manual mode so the paginated model passes data through
        manualPagination:
            options.enablePagination === false
                ? true
                : options.manualPagination,
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
            globalFilter,
            rowSelection,
            sorting,
        },
    });
    const reactTable = rawReactTable as unknown as ContentTableInstance<TData>;

    // v9's useTable returns a new wrapper object every render, where v8
    // returned one stable instance; re-syncing the ref each render would make
    // consumers' `[table]` effect deps refire per render (and loop when they
    // write table state, e.g. resetRowSelection). So this hands out a stable
    // facade — matching v8's own design of a stable instance with per-render
    // synced members: `state`/`options` delegate to the latest wrapper, and
    // the members below are reassigned from the current render's values.
    const latestReactTableRef = useRef(rawReactTable);
    latestReactTableRef.current = rawReactTable;
    const stableTableRef = useRef<ContentTableInstance<TData> | null>(null);
    if (stableTableRef.current === null) {
        Object.defineProperty(reactTable, 'state', {
            get: () => latestReactTableRef.current.state,
        });
        Object.defineProperty(reactTable, 'options', {
            get: () => latestReactTableRef.current.options,
        });
        stableTableRef.current = reactTable;
    }
    const table = stableTableRef.current;

    // v9 removed table.getState(); keep the MRT-style compat surface that
    // merges TanStack state with our runtime-only slices
    table.getState = () => ({
        ...table.store.state,
        editingCell,
        showLoadingOverlay: options.state?.showLoadingOverlay ?? false,
        showProgressBars: options.state?.showProgressBars ?? false,
        showSkeletons: options.state?.showSkeletons ?? false,
    });

    table.lightdashOptions = options;
    table.lightdashState = {
        editingCell:
            editingCell as ContentTableInstance<TData>['lightdashState']['editingCell'],
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
