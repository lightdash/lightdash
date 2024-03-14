import {
    type CustomDimension,
    type Field,
    type PivotReference,
    type ResultRow,
    type SortField,
    type TableCalculation,
} from '@lightdash/common';
import {
    createColumnHelper,
    type Cell,
    type ColumnDef,
    type Header,
} from '@tanstack/react-table';
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
    };
};

export const columnHelper = createColumnHelper<ResultRow>();

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 5000;

export const ROW_NUMBER_COLUMN_ID = 'row_number_column';
