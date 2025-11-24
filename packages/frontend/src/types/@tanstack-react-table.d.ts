import {
    type ItemsMap,
    type PivotReference,
    type VizColumnsConfig,
} from '@lightdash/common';
import { type MouseEventHandler } from 'react';
import { type ColumnStatsMap } from '../components/DataViz/utils/columnStats';
import { type Sort } from '../components/common/Table/types';

declare module '@tanstack/react-table' {
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
        isReadOnly?: boolean; // For computed/derived columns like period-over-period
        onHeaderClick?: MouseEventHandler<HTMLTableHeaderCellElement>;
        type?: string;
        headerInfo?: Record<string, any>;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
    interface TableMeta<_TData extends RowData> {
        columnStats?: ColumnStatsMap;
        columnsConfig?: VizColumnsConfig;
    }
}
