import { MetricQuery } from './metricQuery';
import { UpdatedByUser } from './user';

export enum ChartType {
    CARTESIAN = 'cartesian',
    TABLE = 'table',
    BIG_NUMBER = 'big_number',
}

export enum NumberStyle {
    THOUSANDS = 'thousands',
    MILLIONS = 'millions',
    BILLIONS = 'billions',
}
export type BigNumber = {
    label?: string;
    style?: NumberStyle;
};

export type BigNumberConfig = {
    type: ChartType.BIG_NUMBER;
    config?: BigNumber;
};

export type TableChart = {
    showTableNames?: boolean;
};

type TableChartConfig = {
    type: ChartType.TABLE;
    config?: TableChart;
};

export enum CartesianSeriesType {
    LINE = 'line',
    BAR = 'bar',
    SCATTER = 'scatter',
    AREA = 'area',
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
    stack?: string;
    name?: string;
    color?: string;
    yAxisIndex?: number;
    label?: {
        show?: boolean;
        position?: 'left' | 'top' | 'right' | 'bottom';
    };
    hidden?: boolean;
    areaStyle?: {};
    showSymbol?: boolean;
    smooth?: boolean;
};

export type EchartsLegend = {
    show?: boolean;
    type?: 'plain' | 'scroll';
    orient?: 'horizontal' | 'vertical';
    top?: string;
    right?: string;
    bottom?: string;
    left?: string;
    width?: string;
    height?: string;
    align?: 'auto' | 'left' | 'right';
    icon?:
        | 'circle'
        | 'rect'
        | 'roundRect'
        | 'triangle'
        | 'diamond'
        | 'pin'
        | 'arrow'
        | 'none';
};

export type EchartsGrid = {
    containLabel?: boolean;
    top?: string;
    right?: string;
    bottom?: string;
    left?: string;
    width?: string;
    height?: string;
};

export type CompleteEChartsConfig = {
    legend?: EchartsLegend;
    grid?: EchartsGrid;
    series: Series[];
    xAxis: Axis[];
    yAxis: Axis[];
};

export type EChartsConfig = Partial<CompleteEChartsConfig>;

type Axis = {
    name?: string;
    min?: string | undefined;
    max?: string | undefined;
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
    description?: string;
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
    updatedByUser?: UpdatedByUser;
    organizationUuid: string;
};

export type CreateSavedChart = Omit<
    SavedChart,
    'uuid' | 'updatedAt' | 'projectUuid' | 'organizationUuid'
>;

export type CreateSavedChartVersion = Omit<
    SavedChart,
    'uuid' | 'name' | 'updatedAt' | 'projectUuid' | 'organizationUuid'
>;

export type UpdateSavedChart = Pick<SavedChart, 'name' | 'description'>;

export const isCompleteLayout = (
    value: CartesianChartLayout | undefined,
): value is CompleteCartesianChartLayout =>
    !!value && !!value.xField && !!value.yField && value.yField.length > 0;

export const isCompleteEchartsConfig = (
    value: EChartsConfig | undefined,
): value is CompleteEChartsConfig =>
    !!value && !!value.series && value.series.length > 0;

export const isCartesianChartConfig = (
    value: ChartConfig['config'],
): value is CartesianChart =>
    !!value && 'layout' in value && 'eChartsConfig' in value;

export const isBigNumberConfig = (
    value: ChartConfig['config'],
): value is BigNumber => !!value && !isCartesianChartConfig(value);

export const isTableChartConfig = (
    value: ChartConfig['config'],
): value is TableChart => !!value && !isCartesianChartConfig(value);

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
    '#fc8452',
    '#91cc75',
    '#fac858',
    '#ee6666',
    '#73c0de',
    '#3ba272',
    '#9a60b4',
    '#ea7ccc',
];

export const getDefaultSeriesColor = (index: number) =>
    ECHARTS_DEFAULT_COLORS[index % ECHARTS_DEFAULT_COLORS.length];

export const isSeriesWithMixedChartTypes = (
    series: Series[] | undefined,
): boolean => new Set(series?.map(({ type }) => type)).size >= 2;
