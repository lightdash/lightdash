import { MetricQuery } from './metricQuery';

export enum ChartType {
    CARTESIAN = 'cartesian',
    TABLE = 'table',
    BIG_NUMBER = 'big_number',
}

type BigNumberConfig = {
    type: ChartType.BIG_NUMBER;
    config: undefined;
};

type TableChartConfig = {
    type: ChartType.TABLE;
    config: undefined;
};

export enum CartesianSeriesType {
    LINE = 'line',
    BAR = 'bar',
    SCATTER = 'scatter',
}

type PivotReference = {
    field: string;
    pivotValues?: { field: string; value: any }[];
};

export type Series = {
    encode: {
        xRef: PivotReference;
        yRef: PivotReference;
        x?: string; // hash of xRef
        y?: string; // hash of yRef
    };
    type: CartesianSeriesType;
    name?: string;
    color?: string;
    label?: {
        show?: boolean;
        position?: 'left' | 'top' | 'right' | 'bottom';
    };
};

export type CompleteEChartsConfig = {
    series: Series[];
    xAxis: Axis[];
    yAxis: Axis[];
};

export type EChartsConfig = Partial<CompleteEChartsConfig>;

type Axis = {
    name?: string;
};

export type CompleteCartesianChartLayout = {
    xField: string;
    yField: string[];
    flipAxes?: boolean | undefined;
};

export type CartesianChartLayout = Partial<CompleteCartesianChartLayout>;

export type CartesianChart = {
    layout: CartesianChartLayout;
    eChartsConfig: EChartsConfig;
};

export type CartesianChartConfig = {
    type: ChartType.CARTESIAN;
    config: CartesianChart;
};

export type ChartConfig =
    | BigNumberConfig
    | TableChartConfig
    | CartesianChartConfig;

export type SavedChartType = ChartType;

export type SavedChart = {
    uuid: string;
    projectUuid: string;
    name: string;
    tableName: string;
    metricQuery: MetricQuery;
    pivotConfig?: {
        columns: string[];
    };
    chartConfig: ChartConfig;
    tableConfig: {
        columnOrder: string[];
    };
    updatedAt: Date;
};

export type CreateSavedChart = Omit<
    SavedChart,
    'uuid' | 'updatedAt' | 'projectUuid'
>;

export type CreateSavedChartVersion = Omit<
    SavedChart,
    'uuid' | 'name' | 'updatedAt' | 'projectUuid'
>;

export type UpdateSavedChart = Pick<SavedChart, 'name'>;

export const isCompleteLayout = (
    value: CartesianChartLayout | undefined,
): value is CompleteCartesianChartLayout =>
    !!value && !!value.xField && !!value.yField && value.yField.length > 0;

export const isCompleteEchartsConfig = (
    value: EChartsConfig | undefined,
): value is CompleteEChartsConfig =>
    !!value && !!value.series && value.series.length > 0;

export const hashFieldReference = (reference: PivotReference) =>
    reference.pivotValues
        ? `${reference.field}.${reference.pivotValues
              .map(({ field, value }) => `${field}.${value}`)
              .join('.')}`
        : reference.field;

export const getSeriesId = (series: Series) =>
    `${hashFieldReference(series.encode.xRef)}|${hashFieldReference(
        series.encode.yRef,
    )}`;

export const ECHARTS_DEFAULT_COLORS = [
    '#5470c6',
    '#91cc75',
    '#fac858',
    '#ee6666',
    '#73c0de',
    '#3ba272',
    '#fc8452',
    '#9a60b4',
    '#ea7ccc',
];

export const getDefaultSeriesColor = (index: number) =>
    ECHARTS_DEFAULT_COLORS[index % ECHARTS_DEFAULT_COLORS.length];
