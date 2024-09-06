import { type DimensionType } from '../../types/field';
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

export const vizAggregationOptions = [
    VizAggregationOptions.SUM,
    VizAggregationOptions.COUNT,
    VizAggregationOptions.AVERAGE,
    VizAggregationOptions.MIN,
    VizAggregationOptions.MAX,
    VizAggregationOptions.ANY,
];

export const VIZ_DEFAULT_AGGREGATION = VizAggregationOptions.COUNT;

export type VizSqlColumn = {
    reference: string;
    type?: DimensionType;
};

export enum VizIndexType {
    TIME = 'time',
    CATEGORY = 'category',
}

export type VizIndexLayoutOptions = {
    type: VizIndexType;
    reference: string;
};

export type VizValuesLayoutOptions = {
    reference: string;
    aggregationOptions: VizAggregationOptions[];
};

export type VizPivotLayoutOptions = {
    reference: string;
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
        aggregation: VizAggregationOptions;
    }[];
    groupBy: { reference: string }[] | undefined;
};

export type VizPieChartDisplay = {
    isDonut?: boolean;
};

export type PivotChartData = {
    results: RawResultRow[];
    indexColumn: { reference: string; type: string } | undefined;
    valuesColumns: string[];
    columns: VizSqlColumn[];
};

export type VizCartesianChartOptions = {
    indexLayoutOptions: VizIndexLayoutOptions[];
    valuesLayoutOptions: VizValuesLayoutOptions[];
    pivotLayoutOptions: VizPivotLayoutOptions[];
};

export type VizPieChartOptions = {
    groupFieldOptions: VizIndexLayoutOptions[];
    metricFieldOptions: VizValuesLayoutOptions[];
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
    fieldConfig: VizChartLayout | undefined;
    display: CartesianChartDisplay | undefined;
};

export type VizBarChartConfig = VizBaseConfig & {
    type: ChartKind.VERTICAL_BAR;
    fieldConfig: VizChartLayout | undefined;
    display: CartesianChartDisplay | undefined;
};

export type VizLineChartConfig = VizBaseConfig & {
    type: ChartKind.LINE;
    fieldConfig: VizChartLayout | undefined; // PR NOTE: types are identical
    display: CartesianChartDisplay | undefined;
};

export type VizPieChartConfig = VizBaseConfig & {
    type: ChartKind.PIE;
    fieldConfig: VizChartLayout | undefined; // PR NOTE: this will break serialization to the database (types are different)
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
