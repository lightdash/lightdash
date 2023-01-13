import { ConditionalFormattingConfig } from './conditionalFormatting';
import { CompactOrAlias } from './field';
import { MetricQuery } from './metricQuery';
import { UpdatedByUser } from './user';

export enum ChartType {
    CARTESIAN = 'cartesian',
    TABLE = 'table',
    BIG_NUMBER = 'big_number',
}
export type BigNumber = {
    label?: string;
    style?: CompactOrAlias;
    selectedField?: string;
};

export type BigNumberConfig = {
    type: ChartType.BIG_NUMBER;
    config?: BigNumber;
};

export type ColumnProperties = {
    visible?: boolean;
    name?: string;
    frozen?: boolean;
};

export type TableChart = {
    showColumnCalculation?: boolean;
    showTableNames?: boolean;
    hideRowNumbers?: boolean;
    columns?: Record<string, ColumnProperties>;
    conditionalFormattings?: ConditionalFormattingConfig[];
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

export type PivotReference = {
    field: string;
    pivotValues?: { field: string; value: any }[];
};

export const isPivotReferenceWithValues = (
    value: PivotReference,
): value is Required<PivotReference> =>
    !!value.pivotValues && value.pivotValues.length > 0;

export type MarkLineData = {
    yAxis?: string;
    xAxis?: string;
    name: string;
    lineStyle?: {
        color: string;
    };
    label?: {
        formatter?: string;
    };
};
export type MarkLine = {
    data: MarkLineData[];
    symbol?: string;
    lineStyle?: {
        color: string;
        width: number;
        type: string;
    };
    label?: {
        formatter?: string;
    };
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
    stackLabel?: {
        show?: boolean;
    };
    name?: string;
    color?: string;
    yAxisIndex?: number;
    label?: {
        show?: boolean;
        position?: 'left' | 'top' | 'right' | 'bottom' | 'inside';
    };
    hidden?: boolean;
    areaStyle?: {};
    showSymbol?: boolean;
    smooth?: boolean;
    markLine?: MarkLine;
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
    inverse?: boolean;
};

export type CompleteCartesianChartLayout = {
    xField: string;
    yField: string[];
    flipAxes?: boolean | undefined;
    showGridX?: boolean | undefined;
    showGridY?: boolean | undefined;
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
    spaceUuid: string;
    spaceName: string;
};

export type CreateSavedChart = Omit<
    SavedChart,
    | 'uuid'
    | 'updatedAt'
    | 'projectUuid'
    | 'organizationUuid'
    | 'spaceUuid'
    | 'spaceName'
> & { spaceUuid?: string };

export type CreateSavedChartVersion = Omit<
    SavedChart,
    | 'uuid'
    | 'name'
    | 'updatedAt'
    | 'projectUuid'
    | 'organizationUuid'
    | 'spaceUuid'
    | 'spaceName'
>;

export type UpdateSavedChart = Pick<
    SavedChart,
    'name' | 'description' | 'spaceUuid'
>;

export type UpdateMultipleSavedChart = Pick<
    SavedChart,
    'uuid' | 'name' | 'description' | 'spaceUuid'
>;

export type SpaceQuery = Pick<
    SavedChart,
    | 'uuid'
    | 'name'
    | 'updatedAt'
    | 'updatedByUser'
    | 'description'
    | 'spaceUuid'
>;

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
): boolean =>
    new Set(
        series?.map(
            ({ type, areaStyle }) =>
                `${type}${
                    type === CartesianSeriesType.LINE ? areaStyle : undefined
                }`,
        ),
    ).size >= 2;
