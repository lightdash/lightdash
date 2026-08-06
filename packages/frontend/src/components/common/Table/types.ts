import type {
    ColumnProperties,
    ConditionalFormattingConfig,
    ConditionalFormattingMinMaxMap,
    CustomDimension,
    Field,
    PivotReference,
    ResultRow,
    ResultValue,
    SortField,
    TableCalculation,
} from '@lightdash/common';
import {
    createColumnHelper,
    type Cell,
    type CellContext,
    type ColumnDef,
    type Header,
    type Table,
} from '@tanstack/react-table';
import { type CSSProperties, type FC } from 'react';
import { type JsonCellValue } from '../JsonViewer/utils';

export type HeaderProps = { header: Header<ResultRow, any> };
export type CellContextMenuProps = {
    cell: Cell<ResultRow, ResultRow[0]>;
    isEditMode?: boolean;
    onViewJsonCell?: (value: JsonCellValue) => void;
};

/**
 * A calculated total shown outside the leaf rows: the grand-total footer row or
 * a subtotal row. `fieldValues` scopes it — empty for a grand total, the group's
 * dimension values for a subtotal.
 */
export type TotalsCellContext = {
    item: Field | TableCalculation | CustomDimension;
    value: ResultValue;
    fieldValues: Record<string, ResultValue>;
};

export type TotalsCellContextMenuProps = { totals: TotalsCellContext };

/** Row/table slice a column needs to resolve its subtotal for a grouped row. */
export type SubtotalCellInfo = Pick<
    CellContext<ResultRow, unknown>,
    'row' | 'table'
>;

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
        labelOverride?: string;
        pivotReference?: PivotReference;
        bgColor?: string;
        sort?: Sort;
        className?: string;
        style?: CSSProperties;
        frozen?: boolean;
        frozenLayout?: { left: number; isLast: boolean };
        isVisible?: boolean;
        isReadOnly?: boolean; // For computed/derived columns like period-over-period
        /** Grand total rendered in the footer row, when this column has one. */
        totalValue?: ResultValue;
        /** Resolves this column's subtotal for a grouped row; null when it has none. */
        getSubtotalValue?: (info: SubtotalCellInfo) => ResultValue | null;
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
    totalsCellContextMenu?: FC<TotalsCellContextMenuProps>;
    pagination?: {
        show?: boolean;
        defaultScroll?: boolean;
        showResultsTotal?: boolean;
    };
    showSubtotals?: boolean;
    showSubtotalsExpanded?: boolean;
    showRowGrouping?: boolean;
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
    onColumnWidthChange?: (fieldId: string, width: number) => void;
};

export type TableContext = ProviderProps & {
    table: Table<ResultRow>;
    isInfiniteScrollEnabled: boolean;
    setIsInfiniteScrollEnabled: (value: boolean) => void;
};
