import type {
    ColumnProperties,
    ConditionalFormattingConfig,
    ConditionalFormattingMinMaxMap,
    CustomDimension,
    Field,
    PivotReference,
    ResultRow,
    SortField,
    TableCalculation,
} from '@lightdash/common';
import {
    createColumnHelper,
    type Cell,
    type ColumnDef,
    type Header,
    type Table,
} from '@tanstack/react-table';
import { type FC } from 'react';
import { type CSSProperties } from 'styled-components';

export type HeaderProps = { header: Header<ResultRow, any> };
export type CellContextMenuProps = {
    cell: Cell<ResultRow, ResultRow[0]>;
    isEditMode?: boolean;
};

export type Sort = {
    sortIndex: number;
    sort: SortField;
    isNumeric: boolean;
    isMultiSort: boolean;
};

export type TableHeader = ColumnDef<ResultRow, unknown>;
export type TableColumn = ColumnDef<ResultRow, ResultRow[0]> & {
    meta?: {
        isInvalidItem?: boolean;
        width?: number;
        draggable?: boolean;
        item?: Field | TableCalculation | CustomDimension;
        pivotReference?: PivotReference;
        bgColor?: string;
        sort?: Sort;
        className?: string;
        style?: CSSProperties;
        frozen?: boolean;
        isVisible?: boolean;
        isReadOnly?: boolean; // For computed/derived columns like period-over-period
    };
};

export const columnHelper = createColumnHelper<ResultRow>();

export type ProviderProps = {
    data: ResultRow[];
    totalRowsCount: number;
    isFetchingRows: boolean;
    fetchMoreRows: () => void;
    columns: Array<TableColumn | TableHeader>;
    headerContextMenu?: FC<React.PropsWithChildren<HeaderProps>>;
    cellContextMenu?: FC<React.PropsWithChildren<CellContextMenuProps>>;
    pagination?: {
        show?: boolean;
        defaultScroll?: boolean;
        showResultsTotal?: boolean;
    };
    showSubtotals?: boolean;
    hideRowNumbers?: boolean;
    showColumnCalculation?: boolean;
    conditionalFormattings?: ConditionalFormattingConfig[];
    minMaxMap?: ConditionalFormattingMinMaxMap;
    columnProperties?: Record<string, ColumnProperties>;
    footer?: {
        show?: boolean;
    };
    columnOrder?: string[];
    onColumnOrderChange?: (value: string[]) => void;
    /** Callback when a column width is changed by the user */
    onColumnWidthChange?: (columnId: string, width: number | undefined) => void;
    /** Enable column resizing via drag handles. Defaults to false. */
    enableColumnResizing?: boolean;
};

export interface ColumnSizingContext {
    /** Whether column resizing is enabled */
    enabled: boolean;
    /** Whether the container has been measured (width > 0) */
    isReady: boolean;
    /** Whether any columns have locked/custom widths (from resize or persisted) */
    hasLockedWidths: boolean;
    /** Computed widths for all columns */
    columnWidths: Record<string, number>;
    /** Total width of frozen columns (row numbers + pinned columns) */
    frozenTotalWidth: number;
    /** Whether horizontal scrolling is needed */
    needsHorizontalScroll: boolean;
    /** Start resizing a column */
    startResize: (columnId: string, startX: number) => void;
    /** Update resize position */
    updateResize: (currentX: number) => void;
    /** End resize and persist */
    endResize: () => void;
    /** Reset a single column to auto width */
    resetColumnWidth: (columnId: string) => void;
    /** Reset all columns to auto width */
    resetAllColumnWidths: () => void;
    /** Check if a column has a locked width */
    isColumnLocked: (columnId: string) => boolean;
    /** Currently resizing column ID, or null */
    resizingColumnId: string | null;
    /** Whether there were locked widths before the current resize started */
    hadLockedWidthsBeforeResize: boolean;
}

export type TableContext = ProviderProps & {
    table: Table<ResultRow>;
    isInfiniteScrollEnabled: boolean;
    setIsInfiniteScrollEnabled: (value: boolean) => void;
    columnSizing: ColumnSizingContext;
};
