import { Field, PivotReference, TableCalculation } from '@lightdash/common';
import { MouseEventHandler } from 'react';
import { Sort } from '../components/common/Table/types';

declare module '@tanstack/table-core' {
    interface ColumnMeta {
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
