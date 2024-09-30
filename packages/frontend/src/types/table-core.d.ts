import { type ItemsMap, type PivotReference } from '@lightdash/common';
import { type MouseEventHandler } from 'react';
import { type Sort } from '../components/common/Table/types';

declare module '@tanstack/table-core' {
    interface ColumnMeta {
        isInvalidItem?: boolean;
        width?: number;
        draggable?: boolean;
        item?: ItemsMap[string];
        pivotReference?: PivotReference;
        bgColor?: string;
        sort?: Sort;
        className?: string;
        style?: CSSProperties;
        frozen?: boolean;
        isVisible?: boolean;
        onHeaderClick?: MouseEventHandler<HTMLTableHeaderCellElement>;
        type?: string;
        headerInfo?: {};
    }
}
