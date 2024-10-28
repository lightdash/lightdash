import { DimensionType } from '../../types/field';
import { type RawResultRow } from '../../types/results';
import { ChartKind } from '../../types/savedCharts';
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

export type VizColumn = {
    reference: string;
    type?: DimensionType;
};

export enum VizIndexType {
    TIME = 'time',
    CATEGORY = 'category',
}

export function getColumnAxisType(column: VizColumn): VizIndexType {
    switch (column.type) {
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

export type PivotIndexColum =
    | { reference: string; type: VizIndexType }
    | undefined;

export type PivotChartData = {
    fileUrl: string | undefined;
    results: RawResultRow[];
    indexColumn: PivotIndexColum;
    valuesColumns: string[];
    columns: VizColumn[];
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
