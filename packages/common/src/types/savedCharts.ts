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
    xField: string;
    yField: string;
    type: CartesianSeriesType;
    flipAxes?: boolean | undefined;
};

type Axis = {
    name?: string;
};

export type CartesianChart = {
    series: Series[];
    xAxes?: Axis[];
    yAxes?: Axis[];
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
