import { Field, PivotReference, TableCalculation } from '@lightdash/common';
import { RowData } from '@tanstack/react-table';
import { MouseEventHandler } from 'react';
import { Sort } from '../components/common/Table/types';

declare module '@tanstack/table-core' {
    interface ColumnMeta<TData extends RowData, TValue> {
        isInvalidItem?: boolean;
        width?: number;
        draggable?: boolean;
        item?: Field | TableCalculation;
        pivotReference?: PivotReference;
        bgColor?: string;
        sort?: Sort;
        className?: string;
        style?: CSSProperties;
        frozen?: boolean;
        onHeaderClick?: MouseEventHandler<HTMLTableHeaderCellElement>;
    }
}
