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

export type Series = {
    encode: {
        x: string; // `explore.field.pivot.values`
        y: string; // `explore.field.pivot.values`
    };
    type: CartesianSeriesType;
    name?: string;
    color?: string;
    label?: {
        show?: boolean;
        position?: 'left' | 'top' | 'right' | 'bottom';
    };
};

export type EChartsConfig = {
    series?: Series[];
    xAxis?: Axis[];
    yAxis?: Axis[];
};

type Axis = {
    name?: string;
};

// type PrevSeries = {
//     xField: string;
//     yField: string;
//     type: CartesianSeriesType;
//     flipAxes?: boolean | undefined;
//     name?: string;
//     color?: string;
//     label?: {
//         show?: boolean;
//         position?: 'left' | 'top' | 'right' | 'bottom';
//     };
// };
// type Prev = {
//     series: PrevSeries[];
//     xAxes?: Axis[];
//     yAxes?: Axis[];
// };

// const configMap = (prev: Prev): CartesianChart => ({
//     layout: {
//         xField: prev.series[0].xField,
//         yField: prev.series.map((s) => s.yField),
//         flipAxes: prev.series[0].flipAxes,
//     },
//     eChartsConfig: {
//         series: prev.series.map((s) => ({
//             encode: {
//                 x: s.xField,
//                 y: s.yField,
//             },
//             type: s.type,
//             name: s.name,
//             color: s.color,
//             label: s.label,
//         })),
//         xAxis: prev.xAxes,
//         yAxis: prev.yAxes,
//     },
// });

export type CartesianChart = {
    layout: {
        xField?: string;
        yField?: string[];
        flipAxes?: boolean | undefined;
    };
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
