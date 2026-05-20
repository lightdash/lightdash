import {
    type Cell,
    type CellContext,
    type Column,
    type ColumnOrderState,
    type Header,
    type OnChangeFn,
    type Row,
    type RowData,
    type RowSelectionState,
    type SortingFnOption,
    type SortingState,
    type Table as TanStackTable,
    type TableState,
    type Updater,
    type VisibilityState,
} from '@tanstack/react-table';
import { type Virtualizer } from '@tanstack/react-virtual';
import {
    type CSSProperties,
    type MouseEventHandler,
    type MutableRefObject,
    type ReactNode,
    type Ref,
    type UIEventHandler,
} from 'react';

export type InHouseTableVirtualizer<
    TScrollElement extends Element | Window = HTMLDivElement,
    TItemElement extends Element = HTMLTableRowElement,
> = Virtualizer<TScrollElement, TItemElement>;

export type InHouseTableSortingState = SortingState;

export type InHouseTableDensity = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export type InHouseTableHeaderColumn<TData extends RowData> = Omit<
    Column<TData, unknown>,
    'columnDef'
> & {
    columnDef: Omit<Column<TData, unknown>['columnDef'], 'header'> & {
        header?: ReactNode;
    };
};

export type InHouseTableColumnDef<TData extends RowData> = {
    id?: string;
    accessorKey?: string;
    accessorFn?: (originalRow: TData, index: number) => unknown;
    header?:
        | ReactNode
        | ((props: {
              column: InHouseTableHeaderColumn<TData>;
              header: Header<TData, unknown>;
              table: InHouseTableInstance<TData>;
          }) => ReactNode);
    Header?: (props: {
        column: InHouseTableHeaderColumn<TData>;
        header: Header<TData, unknown>;
        table: InHouseTableInstance<TData>;
    }) => ReactNode;
    Cell?: (
        props: Omit<CellContext<TData, unknown>, 'table' | 'row'> & {
            renderedCellValue: ReactNode;
            row: Row<TData>;
            table: InHouseTableInstance<TData>;
        },
    ) => ReactNode;
    Edit?: (
        props: Omit<CellContext<TData, unknown>, 'cell' | 'row' | 'table'> & {
            cell: Cell<TData, unknown>;
            row: Row<TData>;
            table: InHouseTableInstance<TData>;
        },
    ) => ReactNode;
    Footer?: (props: {
        column: Column<TData, unknown>;
        header: Header<TData, unknown>;
        table: InHouseTableInstance<TData>;
    }) => ReactNode;
    columns?: InHouseTableColumnDef<TData>[];
    enableEditing?: boolean;
    enableResizing?: boolean;
    enableSorting?: boolean;
    grow?: boolean;
    mantineTableBodyCellProps?: InHouseTablePropFactory<
        HTMLTableCellElement,
        {
            cell: Cell<TData, unknown>;
            column: Column<TData, unknown>;
            row: Row<TData>;
            table: InHouseTableInstance<TData>;
        }
    >;
    mantineTableHeadCellProps?: InHouseTablePropFactory<
        HTMLTableCellElement,
        {
            column: Column<TData, unknown>;
            header: Header<TData, unknown>;
            table: InHouseTableInstance<TData>;
        }
    >;
    maxSize?: number;
    minSize?: number;
    size?: number;
    sortingFn?: SortingFnOption<TData>;
    meta?: Record<string, unknown>;
};

export type InHouseTableState = {
    columnOrder?: ColumnOrderState;
    columnVisibility?: VisibilityState;
    density?: InHouseTableDensity;
    editingCell?: Cell<RowData, unknown> | null;
    globalFilter?: string;
    isLoading?: boolean;
    rowSelection?: RowSelectionState;
    showAlertBanner?: boolean;
    showLoadingOverlay?: boolean;
    showProgressBars?: boolean;
    showSkeletons?: boolean;
    sorting?: SortingState;
};

export type InHouseTableInitialState = {
    columnOrder?: ColumnOrderState;
    columnVisibility?: VisibilityState;
    globalFilter?: string;
    pagination?: {
        pageIndex?: number;
        pageSize?: number;
    };
    density?: InHouseTableDensity;
    showGlobalFilter?: boolean;
    sorting?: SortingState;
};

export type InHouseTableMantineProps<TElement extends HTMLElement> = {
    bg?: unknown;
    className?: string;
    h?: unknown;
    onClick?: MouseEventHandler<TElement>;
    onScroll?: UIEventHandler<TElement>;
    pos?: unknown;
    ref?: Ref<TElement>;
    shadow?: string;
    style?: CSSProperties;
    sx?: unknown;
    w?: unknown;
    [key: string]: unknown;
};

export type InHouseTablePropFactory<TElement extends HTMLElement, TArgs> =
    | InHouseTableMantineProps<TElement>
    | ((args: TArgs) => InHouseTableMantineProps<TElement>);

export type InHouseTableOptions<TData extends RowData> = {
    columns: InHouseTableColumnDef<TData>[];
    data: TData[];
    columnResizeMode?: 'onChange' | 'onEnd';
    defaultColumn?: Partial<InHouseTableColumnDef<TData>>;
    defaultDisplayColumn?: Partial<InHouseTableColumnDef<TData>>;
    displayColumnDefOptions?: Record<
        string,
        Partial<InHouseTableColumnDef<TData>>
    >;
    editDisplayMode?: 'cell' | 'row' | 'table' | 'modal' | 'custom';
    emptyState?: {
        emptyMessage?: ReactNode;
        entityName?: string;
        filteredMessage?: ReactNode;
        hasActiveFilters?: boolean;
        onClearFilters?: () => void;
        search?: string;
    };
    enableBottomToolbar?: boolean;
    enableColumnActions?: boolean;
    enableColumnFilters?: boolean;
    enableColumnResizing?: boolean;
    enableDensityToggle?: boolean;
    enableEditing?: boolean;
    enableFilterMatchHighlighting?: boolean;
    enableFilters?: boolean;
    enableFullScreenToggle?: boolean;
    enableGlobalFilter?: boolean;
    enableGlobalFilterModes?: boolean;
    enableHiding?: boolean;
    enableMultiSort?: boolean;
    enablePagination?: boolean;
    enableRowActions?: boolean;
    enableRowNumbers?: boolean;
    enableRowSelection?: boolean | ((row: Row<TData>) => boolean);
    enableRowVirtualization?: boolean;
    enableSorting?: boolean;
    enableStickyHeader?: boolean;
    enableTopToolbar?: boolean;
    getRowId?: (
        originalRow: TData,
        index: number,
        parent?: Row<TData>,
    ) => string;
    icons?: {
        IconArrowsSort?: () => ReactNode;
        IconSortAscending?: () => ReactNode;
        IconSortDescending?: () => ReactNode;
    };
    initialState?: InHouseTableInitialState;
    manualFiltering?: boolean;
    manualPagination?: boolean;
    manualSorting?: boolean;
    mantineLoadingOverlayProps?: Record<string, unknown>;
    mantinePaginationProps?: Record<string, unknown>;
    mantinePaperProps?: InHouseTableMantineProps<HTMLDivElement>;
    mantineSelectAllCheckboxProps?: Record<string, unknown>;
    mantineSelectCheckboxProps?: Record<string, unknown>;
    mantineTableBodyCellProps?: InHouseTablePropFactory<
        HTMLTableCellElement,
        {
            cell: Cell<TData, unknown>;
            column: Column<TData, unknown>;
            row: Row<TData>;
            table: InHouseTableInstance<TData>;
        }
    >;
    mantineTableBodyProps?: InHouseTableMantineProps<HTMLTableSectionElement>;
    mantineTableBodyRowProps?: InHouseTablePropFactory<
        HTMLTableRowElement,
        { row: Row<TData>; table: InHouseTableInstance<TData> }
    >;
    mantineTableContainerProps?: InHouseTableMantineProps<HTMLDivElement>;
    mantineTableFooterCellProps?: InHouseTablePropFactory<
        HTMLTableCellElement,
        {
            column: Column<TData, unknown>;
            header: Header<TData, unknown>;
            table: InHouseTableInstance<TData>;
        }
    >;
    mantineTableHeadProps?: InHouseTableMantineProps<HTMLTableSectionElement>;
    mantineTableHeadCellProps?: InHouseTablePropFactory<
        HTMLTableCellElement,
        {
            column: Column<TData, unknown>;
            header: Header<TData, unknown>;
            table: InHouseTableInstance<TData>;
        }
    >;
    mantineTableHeadRowProps?: InHouseTableMantineProps<HTMLTableRowElement>;
    mantineTableProps?: InHouseTableMantineProps<HTMLTableElement> & {
        highlightOnHover?: boolean;
        withColumnBorders?: boolean;
    };
    onColumnOrderChange?: OnChangeFn<ColumnOrderState>;
    onColumnVisibilityChange?: OnChangeFn<VisibilityState>;
    onGlobalFilterChange?: (value: string) => void;
    onRowSelectionChange?: OnChangeFn<RowSelectionState>;
    onSortingChange?: OnChangeFn<SortingState>;
    pageCount?: number;
    paginationDisplayMode?: 'default' | 'pages';
    positionActionsColumn?: 'first' | 'last';
    positionGlobalFilter?: 'left' | 'right';
    renderBottomToolbar?: (props: {
        table: InHouseTableInstance<TData>;
    }) => ReactNode;
    renderEmptyRowsFallback?: (props: {
        table: InHouseTableInstance<TData>;
    }) => ReactNode;
    renderRowActions?: (props: {
        row: Row<TData>;
        table: InHouseTableInstance<TData>;
    }) => ReactNode;
    renderTopToolbar?: (props: {
        table: InHouseTableInstance<TData>;
    }) => ReactNode;
    rowCount?: number;
    rowVirtualizerInstanceRef?: React.MutableRefObject<InHouseTableVirtualizer<
        HTMLDivElement,
        HTMLTableRowElement
    > | null>;
    rowVirtualizerProps?: {
        estimateSize?: () => number;
        overscan?: number;
    };
    state?: InHouseTableState;
};

export type InHouseTableRuntimeState = {
    editingCell: Cell<RowData, unknown> | null;
    globalFilter: string;
    isLoading: boolean;
    showAlertBanner: boolean;
    showLoadingOverlay: boolean;
    showProgressBars: boolean;
    showSkeletons: boolean;
};

export type InHouseTableStateWithCompat<TData extends RowData> = TableState & {
    editingCell?: Cell<TData, unknown> | null;
    showLoadingOverlay?: boolean;
    showProgressBars?: boolean;
    showSkeletons?: boolean;
};

export type InHouseTableInstance<TData extends RowData> = Omit<
    TanStackTable<TData>,
    'getState'
> & {
    getState: () => InHouseTableStateWithCompat<TData>;
    lightdashOptions: InHouseTableOptions<TData>;
    lightdashState: InHouseTableRuntimeState;
    refs: {
        tableContainerRef: MutableRefObject<HTMLDivElement | null>;
    };
    setEditingCell: (cell: Cell<TData, unknown> | null) => void;
};

export type InHouseTableUpdater<TValue> = Updater<TValue>;

export type MRT_ColumnDef<TData extends RowData> = InHouseTableColumnDef<TData>;
export type MRT_Row<TData extends RowData> = Row<TData>;
export type MRT_SortingState = InHouseTableSortingState;
export type MRT_TableInstance<TData extends RowData> =
    InHouseTableInstance<TData>;
export type MRT_TableOptions<TData extends RowData> =
    InHouseTableOptions<TData>;
export type MRT_Virtualizer<
    TScrollElement extends Element | Window = HTMLDivElement,
    TItemElement extends Element = HTMLTableRowElement,
> = InHouseTableVirtualizer<TScrollElement, TItemElement>;
