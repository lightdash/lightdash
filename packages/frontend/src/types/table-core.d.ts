import { ItemsMap, PivotReference } from '@lightdash/common';
import { MouseEventHandler } from 'react';
import { Sort } from '../components/common/Table/types';

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
    }
}
