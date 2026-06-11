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

export type ContentTableVirtualizer<
    TScrollElement extends Element | Window = HTMLDivElement,
    TItemElement extends Element = HTMLTableRowElement,
> = Virtualizer<TScrollElement, TItemElement>;

export type ContentTableSortingState = SortingState;

export type ContentTableRow<TData extends RowData> = Row<TData>;

export type ContentTableDensity = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export type ContentTableHeaderColumn<TData extends RowData> = Omit<
    Column<TData, unknown>,
    'columnDef'
> & {
    columnDef: Omit<Column<TData, unknown>['columnDef'], 'header'> & {
        header?: ReactNode;
    };
};

export type ContentTableColumnDef<TData extends RowData> = {
    id?: string;
    accessorKey?: string;
    accessorFn?: (originalRow: TData, index: number) => unknown;
    header?:
        | ReactNode
        | ((props: {
              column: ContentTableHeaderColumn<TData>;
              header: Header<TData, unknown>;
              table: ContentTableInstance<TData>;
          }) => ReactNode);
    Header?: (props: {
        column: ContentTableHeaderColumn<TData>;
        header: Header<TData, unknown>;
        table: ContentTableInstance<TData>;
    }) => ReactNode;
    Cell?: (
        props: Omit<CellContext<TData, unknown>, 'table' | 'row'> & {
            renderedCellValue: ReactNode;
            row: Row<TData>;
            table: ContentTableInstance<TData>;
        },
    ) => ReactNode;
    Edit?: (
        props: Omit<CellContext<TData, unknown>, 'cell' | 'row' | 'table'> & {
            cell: Cell<TData, unknown>;
            row: Row<TData>;
            table: ContentTableInstance<TData>;
        },
    ) => ReactNode;
    Footer?: (props: {
        column: Column<TData, unknown>;
        header: Header<TData, unknown>;
        table: ContentTableInstance<TData>;
    }) => ReactNode;
    columns?: ContentTableColumnDef<TData>[];
    enableEditing?: boolean;
    enableResizing?: boolean;
    enableSorting?: boolean;
    grow?: boolean;
    mantineTableBodyCellProps?: ContentTablePropFactory<
        HTMLTableCellElement,
        {
            cell: Cell<TData, unknown>;
            column: Column<TData, unknown>;
            row: Row<TData>;
            table: ContentTableInstance<TData>;
        }
    >;
    mantineTableHeadCellProps?: ContentTablePropFactory<
        HTMLTableCellElement,
        {
            column: Column<TData, unknown>;
            header: Header<TData, unknown>;
            table: ContentTableInstance<TData>;
        }
    >;
    maxSize?: number;
    minSize?: number;
    size?: number;
    sortingFn?: SortingFnOption<TData>;
    meta?: Record<string, unknown>;
};

export type ContentTableState = {
    columnOrder?: ColumnOrderState;
    columnVisibility?: VisibilityState;
    density?: ContentTableDensity;
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

export type ContentTableInitialState = {
    columnOrder?: ColumnOrderState;
    columnVisibility?: VisibilityState;
    globalFilter?: string;
    pagination?: {
        pageIndex?: number;
        pageSize?: number;
    };
    density?: ContentTableDensity;
    showGlobalFilter?: boolean;
    sorting?: SortingState;
};

export type ContentTableMantineProps<TElement extends HTMLElement> = {
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

export type ContentTablePropFactory<TElement extends HTMLElement, TArgs> =
    | ContentTableMantineProps<TElement>
    | ((args: TArgs) => ContentTableMantineProps<TElement>);

export type ContentTableOptions<TData extends RowData> = {
    columns: ContentTableColumnDef<TData>[];
    data: TData[];
    columnResizeMode?: 'onChange' | 'onEnd';
    defaultColumn?: Partial<ContentTableColumnDef<TData>>;
    defaultDisplayColumn?: Partial<ContentTableColumnDef<TData>>;
    displayColumnDefOptions?: Record<
        string,
        Partial<ContentTableColumnDef<TData>>
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
    initialState?: ContentTableInitialState;
    manualFiltering?: boolean;
    manualPagination?: boolean;
    manualSorting?: boolean;
    mantineLoadingOverlayProps?: Record<string, unknown>;
    mantinePaginationProps?: Record<string, unknown>;
    mantinePaperProps?: ContentTableMantineProps<HTMLDivElement>;
    mantineSelectAllCheckboxProps?: Record<string, unknown>;
    mantineSelectCheckboxProps?: Record<string, unknown>;
    mantineTableBodyCellProps?: ContentTablePropFactory<
        HTMLTableCellElement,
        {
            cell: Cell<TData, unknown>;
            column: Column<TData, unknown>;
            row: Row<TData>;
            table: ContentTableInstance<TData>;
        }
    >;
    mantineTableBodyProps?: ContentTableMantineProps<HTMLTableSectionElement>;
    mantineTableBodyRowProps?: ContentTablePropFactory<
        HTMLTableRowElement,
        { row: Row<TData>; table: ContentTableInstance<TData> }
    >;
    mantineTableContainerProps?: ContentTableMantineProps<HTMLDivElement>;
    mantineTableFooterCellProps?: ContentTablePropFactory<
        HTMLTableCellElement,
        {
            column: Column<TData, unknown>;
            header: Header<TData, unknown>;
            table: ContentTableInstance<TData>;
        }
    >;
    mantineTableHeadProps?: ContentTableMantineProps<HTMLTableSectionElement>;
    mantineTableHeadCellProps?: ContentTablePropFactory<
        HTMLTableCellElement,
        {
            column: Column<TData, unknown>;
            header: Header<TData, unknown>;
            table: ContentTableInstance<TData>;
        }
    >;
    mantineTableHeadRowProps?: ContentTableMantineProps<HTMLTableRowElement>;
    mantineTableProps?: ContentTableMantineProps<HTMLTableElement> & {
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
        table: ContentTableInstance<TData>;
    }) => ReactNode;
    renderEmptyRowsFallback?: (props: {
        table: ContentTableInstance<TData>;
    }) => ReactNode;
    renderRowActions?: (props: {
        row: Row<TData>;
        table: ContentTableInstance<TData>;
    }) => ReactNode;
    renderTopToolbar?: (props: {
        table: ContentTableInstance<TData>;
    }) => ReactNode;
    rowCount?: number;
    rowVirtualizerInstanceRef?: React.MutableRefObject<ContentTableVirtualizer<
        HTMLDivElement,
        HTMLTableRowElement
    > | null>;
    rowVirtualizerProps?: {
        estimateSize?: () => number;
        overscan?: number;
    };
    state?: ContentTableState;
};

export type ContentTableRuntimeState = {
    editingCell: Cell<RowData, unknown> | null;
    globalFilter: string;
    isLoading: boolean;
    showAlertBanner: boolean;
    showLoadingOverlay: boolean;
    showProgressBars: boolean;
    showSkeletons: boolean;
};

export type ContentTableStateWithCompat<TData extends RowData> = TableState & {
    editingCell?: Cell<TData, unknown> | null;
    showLoadingOverlay?: boolean;
    showProgressBars?: boolean;
    showSkeletons?: boolean;
};

export type ContentTableInstance<TData extends RowData> = Omit<
    TanStackTable<TData>,
    'getState'
> & {
    getState: () => ContentTableStateWithCompat<TData>;
    lightdashOptions: ContentTableOptions<TData>;
    lightdashState: ContentTableRuntimeState;
    refs: {
        tableContainerRef: MutableRefObject<HTMLDivElement | null>;
    };
    setEditingCell: (cell: Cell<TData, unknown> | null) => void;
};

export type ContentTableUpdater<TValue> = Updater<TValue>;
