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
};

export type TableContext = ProviderProps & {
    table: Table<ResultRow>;
    isInfiniteScrollEnabled: boolean;
    setIsInfiniteScrollEnabled: (value: boolean) => void;
};
