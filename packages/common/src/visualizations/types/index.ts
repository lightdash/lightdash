import { DimensionType } from '../../types/field';
import { type RawResultRow } from '../../types/results';
import { ChartKind } from '../../types/savedCharts';
import { type CartesianChartDisplay } from '../CartesianChartDataModel';
import { type PivotChartLayout } from './IResultsRunner';

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
export type VizChartLayout = {
    x:
        | {
              reference: string;
              type: VizIndexType;
          }
        | undefined;
    y: {
        reference: string;
        aggregation?: VizAggregationOptions;
    }[];
    groupBy: { reference: string }[] | undefined;
    sortBy?: VizSortBy[];
};

export type VizPieChartDisplay = {
    isDonut?: boolean;
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

export type VizChartConfig =
    | VizBarChartConfig
    | VizLineChartConfig
    | VizPieChartConfig
    | VizTableConfig;
