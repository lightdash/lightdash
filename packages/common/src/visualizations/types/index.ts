import { type AnyType } from '../../types/any';
import { DimensionType, TableCalculationType } from '../../types/field';
import { type PivotConfiguration } from '../../types/pivot';
import { type RawResultRow } from '../../types/results';
import {
    ChartKind,
    type PivotReference,
    type Series,
} from '../../types/savedCharts';
import { type CartesianChartDisplay } from '../CartesianChartDataModel';

export enum VizAggregationOptions {
    SUM = 'sum',
    COUNT = 'count',
    AVERAGE = 'avg',
    MIN = 'min',
    MAX = 'max',
    ANY = 'any',
}

export enum SortByDirection {
    ASC = 'ASC',
    DESC = 'DESC',
}

export const vizAggregationOptions = [
    VizAggregationOptions.SUM,
    VizAggregationOptions.COUNT,
    VizAggregationOptions.AVERAGE,
    VizAggregationOptions.MIN,
    VizAggregationOptions.MAX,
    VizAggregationOptions.ANY,
];

export const VIZ_DEFAULT_AGGREGATION = VizAggregationOptions.COUNT;

/**
 * @deprecated Use type ResultColumn
 */
export type VizColumn = {
    reference: string;
    type?: DimensionType;
};

export enum VizIndexType {
    TIME = 'time',
    CATEGORY = 'category',
}

export enum AxisSide {
    LEFT,
    RIGHT,
}

export enum StackType {
    NONE = 'none',
    NORMAL = 'stack',
    PERCENT = 'stack100',
}

export function getColumnAxisType(dimensionType: DimensionType): VizIndexType {
    switch (dimensionType) {
        case DimensionType.DATE:
        case DimensionType.TIMESTAMP:
            return VizIndexType.TIME;
        case DimensionType.BOOLEAN:
        case DimensionType.NUMBER:
        case DimensionType.STRING:
        default:
            return VizIndexType.CATEGORY;
    }
}

export function getTableCalculationAxisType(
    tableCalculationType: TableCalculationType,
): VizIndexType {
    switch (tableCalculationType) {
        case TableCalculationType.DATE:
        case TableCalculationType.TIMESTAMP:
            return VizIndexType.TIME;
        default:
            return VizIndexType.CATEGORY;
    }
}

export type VizIndexLayoutOptions = {
    axisType: VizIndexType;
    dimensionType: DimensionType;
    aggregationOptions?: VizAggregationOptions[];
    reference: string;
};

export type VizValuesLayoutOptions = {
    reference: string;
    aggregation: VizAggregationOptions; // Currently not available in Semantic viewer API
    aggregationOptions?: VizAggregationOptions[];
};

// A custom metric is a dimension + aggregation type
export type VizCustomMetricLayoutOptions = VizIndexLayoutOptions & {
    aggregation: VizAggregationOptions;
};

export type VizPivotLayoutOptions = {
    reference: string;
};

export type VizSortBy = {
    reference: string;
    direction: SortByDirection;
};

export type VizPieChartDisplay = {
    isDonut?: boolean;
};

export type VizTableDisplay = {
    // TODO: split table display config out of table config
    // On vis column config, visible, label and frozen, at least seem like display options
};

export type PivotIndexColum = { reference: string; type: VizIndexType };

export type PivotValuesColumn = {
    referenceField: string;
    pivotColumnName: string;
    aggregation: VizAggregationOptions;
    pivotValues: {
        referenceField: string;
        value: unknown;
        formatted?: string;
    }[];
    columnIndex?: number;
};

export type PivotChartData = {
    queryUuid: string | undefined;
    fileUrl: string | undefined;
    results: RawResultRow[];
    indexColumn: PivotConfiguration['indexColumn'] | undefined;
    valuesColumns: PivotValuesColumn[];
    columns: VizColumn[];
    columnCount: number | undefined;
};

// TODO: This type is used by both the cartesian and pie chart data models,
// even though it is clearly a cartesian type. Pie should have something that doesn't
// include the x and y options. A future improvement would be to have different
// layout types for chart types that are very different. OR have a more generic
// layout type that can be used for both, but that might break down anyway with
// future chart types (maps, funnel, sankey, etc).
export type PivotChartLayout = {
    x:
        | {
              reference: string;
              type: VizIndexType;
          }
        | undefined;
    y: {
        reference: string;
        aggregation: VizAggregationOptions;
    }[];
    groupBy: { reference: string }[] | undefined;
    sortBy?: VizSortBy[];
    stack?: boolean | StackType; // StackType enum or boolean for backward compatibility
};

export const isPivotChartLayout = (
    obj: PivotChartLayout | VizColumnsConfig | undefined,
): obj is PivotChartLayout => {
    if (typeof obj !== 'object' || obj === null) {
        return false;
    }

    if (!('y' in obj) && !('groupBy' in obj) && !('x' in obj)) {
        return false;
    }

    return true;
};

export type VizCartesianChartOptions = {
    indexLayoutOptions: VizIndexLayoutOptions[];
    valuesLayoutOptions: {
        preAggregated: VizValuesLayoutOptions[];
        customAggregations: VizCustomMetricLayoutOptions[];
    };
    pivotLayoutOptions: VizPivotLayoutOptions[];
};

export type VizPieChartOptions = {
    groupFieldOptions: VizIndexLayoutOptions[];
    metricFieldOptions: VizValuesLayoutOptions[];
    customMetricFieldOptions: VizCustomMetricLayoutOptions[];
};

export type VizColumnConfig = {
    visible: boolean;
    reference: string;
    label: string;
    frozen: boolean;
    order?: number;
    aggregation?: VizAggregationOptions;
    displayStyle?: 'text' | 'bar';
    barConfig?: {
        min?: number; // Default: auto-calculate from column
        max?: number; // Default: auto-calculate from column
        color?: string; // Default: '#5470c6'
    };
};

export type VizColumnsConfig = { [key: string]: VizColumnConfig };

export type VizTableColumnsConfig = {
    columns: VizColumnsConfig;
};

// TODO: FIXME!! it should be a common type!
export type VizTableOptions = {
    defaultColumnConfig: VizTableColumnsConfig['columns'] | undefined;
};

export type VizBaseConfig = {
    metadata: {
        version: number;
    };
    type: ChartKind;
};

export type VizCartesianChartConfig = VizBaseConfig & {
    type: ChartKind.VERTICAL_BAR | ChartKind.LINE;
    fieldConfig: PivotChartLayout | undefined;
    display: CartesianChartDisplay | undefined;
};

export type VizBarChartConfig = VizBaseConfig & {
    type: ChartKind.VERTICAL_BAR;
    fieldConfig: PivotChartLayout | undefined;
    display: CartesianChartDisplay | undefined;
};

export type VizLineChartConfig = VizBaseConfig & {
    type: ChartKind.LINE;
    fieldConfig: PivotChartLayout | undefined;
    display: CartesianChartDisplay | undefined;
};

export type VizPieChartConfig = VizBaseConfig & {
    type: ChartKind.PIE;
    fieldConfig: PivotChartLayout | undefined;
    display: VizPieChartDisplay | undefined;
};

export type VizTableConfig = VizBaseConfig & {
    type: ChartKind.TABLE;
    columns: VizTableColumnsConfig['columns'];
    display: VizTableDisplay | undefined;
};

export type AllVizChartConfig =
    | VizBarChartConfig
    | VizLineChartConfig
    | VizPieChartConfig
    | VizTableConfig;

export const isVizBarChartConfig = (
    value: VizBaseConfig | undefined,
): value is VizBarChartConfig =>
    !!value && value.type === ChartKind.VERTICAL_BAR;

export const isVizLineChartConfig = (
    value: VizBaseConfig | undefined,
): value is VizLineChartConfig => !!value && value.type === ChartKind.LINE;

export const isVizCartesianChartConfig = (
    value: VizBaseConfig | undefined,
): value is VizCartesianChartConfig =>
    !!value &&
    (value.type === ChartKind.LINE || value.type === ChartKind.VERTICAL_BAR);

export const isVizPieChartConfig = (
    value: VizBaseConfig | undefined,
): value is VizPieChartConfig => !!value && value.type === ChartKind.PIE;

export const isVizTableConfig = (
    value: VizBaseConfig | undefined,
): value is VizTableConfig => !!value && value.type === ChartKind.TABLE;

export type VizConfigErrors = {
    indexFieldError?: {
        reference: string;
    };
    metricFieldError?: {
        references: string[];
    };
    customMetricFieldError?: {
        references: string[];
    };
    groupByFieldError?: {
        references: string[];
    };
};

// TODO: this can probably go in VizTableColumnsConfig
export type VizTableHeaderSortConfig = {
    [fieldName: string]: {
        direction: SortByDirection | undefined;
    };
};

export type EChartsSeries = {
    type: Series['type'];
    connectNulls: boolean;
    stack?: string;
    stackLabel?: {
        show?: boolean;
    };
    name?: string;
    color?: string;
    yAxisIndex?: number;
    xAxisIndex?: number;
    encode?: {
        x: string;
        y: string;
        tooltip: string[];
        seriesName: string;
        yRef?: PivotReference;
        xRef?: PivotReference;
    };
    dimensions?: Array<{ name: string; displayName: string }>;
    emphasis?: {
        focus?: string;
    };
    areaStyle?: AnyType;
    pivotReference?: PivotReference;
    label?: {
        show?: boolean;
        fontSize?: number;
        fontWeight?: string;
        position?: 'left' | 'top' | 'right' | 'bottom' | 'inside';
        formatter?: (param: { data: Record<string, unknown> }) => string;
    };
    labelLayout?: {
        hideOverlap?: boolean;
    };
    tooltip?: {
        show?: boolean;
        valueFormatter?: (value: unknown) => string;
    };
    data?: unknown[];
    showSymbol?: boolean;
    symbolSize?: number;
    markLine?: Record<string, unknown>;
    itemStyle?: {
        borderRadius?: number | number[];
        color?: string;
        opacity?: number;
    };
    lineStyle?: {
        type?: 'solid' | 'dashed' | 'dotted';
        width?: number;
        color?: string;
        opacity?: number;
    };
    // Metadata for period-over-period comparison series
    periodOverPeriodMetadata?: {
        siblingSeriesIndex: number;
        periodOffset: number;
        granularity: string;
        /** The field ID of the base metric this PoP series compares against */
        baseFieldId: string;
    };
};

/**
 * SQL Runner specific EChart series type
 * Extends EChartsSeries but with key differences:
 * - type can be a string (from user config) not just CartesianSeriesType
 * - connectNulls is optional
 * - encode structure is simpler (just x and y, not tooltip/seriesName)
 * - dimensions is a tuple not an array of objects
 * - label formatter has different signature
 * - tooltip valueFormatter is more specific (number not unknown)
 * - adds barCategoryGap for bar charts
 * - excludes pivotReference and markLine
 */
export type SqlRunnerEChartsSeries = Omit<
    EChartsSeries,
    | 'type'
    | 'connectNulls'
    | 'encode'
    | 'dimensions'
    | 'label'
    | 'tooltip'
    | 'pivotReference'
    | 'markLine'
> & {
    type: string;
    connectNulls?: boolean;
    encode?: {
        x: string | undefined;
        y: string;
    };
    dimensions?: [string | undefined, string];
    label?: {
        show?: boolean;
        fontSize?: number;
        fontWeight?: string;
        position?: string;
        formatter?: (params: AnyType) => string;
    };
    barCategoryGap?: string;
};
