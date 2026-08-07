import {
    type ColumnProperties,
    type ConditionalFormattingMinMaxMap,
    type ItemsMap,
    type PivotReference,
    type VizColumnsConfig,
} from '@lightdash/common';
import {
    type CellData,
    type RowData,
    type TableFeatures,
} from '@tanstack/react-table';
import { type MouseEventHandler } from 'react';
import { type Sort } from '../components/common/Table/types';
import { type ColumnStatsMap } from '../components/DataViz/utils/columnStats';

declare module '@tanstack/react-table' {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
    interface ColumnMeta<
        in out _TFeatures extends TableFeatures,
        in out _TData extends RowData,
        _TValue extends CellData = CellData,
    > {
        isInvalidItem?: boolean;
        width?: number;
        draggable?: boolean;
        item?: ItemsMap[string];
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
        onHeaderClick?: MouseEventHandler<HTMLTableHeaderCellElement>;
        type?: string;
        headerInfo?: Record<string, any>;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
    interface TableMeta<
        in out _TFeatures extends TableFeatures,
        in out _TData extends RowData,
    > {
        columnStats?: ColumnStatsMap;
        columnsConfig?: VizColumnsConfig;
        columnProperties?: Record<string, ColumnProperties>;
        minMaxMap?: ConditionalFormattingMinMaxMap;
        // Widest formatted label per column, used to reserve a constant
        // label gutter so "bars in cells" scale against the same track width
        barLabelMaxMap?: Record<string, string>;
    }
}
