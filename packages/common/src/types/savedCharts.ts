import { MetricQuery } from './metricQuery';

type BigNumberConfig = {
    type: 'big_number';
    config: undefined;
};

type TableChartConfig = {
    type: 'table';
    config: undefined;
};

export enum CartesianSeriesType {
    LINE = 'line',
    BAR = 'bar',
    SCATTER = 'scatter',
}

type Series = {
    xField: string;
    yField: string;
    type: CartesianSeriesType;
    flipAxes?: boolean | undefined;
};

type CartesianChart = {
    series: Series[];
};
export type CartesianChartConfig = {
    type: 'cartesian';
    config: CartesianChart;
};

export type ChartConfig =
    | BigNumberConfig
    | TableChartConfig
    | CartesianChartConfig;

export type SavedChartType = ChartConfig['type'];

export enum DBChartTypes {
    COLUMN = 'column',
    BAR = 'bar',
    LINE = 'line',
    SCATTER = 'scatter',
    TABLE = 'table',
    BIG_NUMBER = 'big_number',
}

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
