import { type DimensionType } from '../../types/field';

export enum VizAggregationOptions {
    SUM = 'sum',
    COUNT = 'count',
    MIN = 'min',
    MAX = 'max',
    FIRST = 'first',
}

export const vizAggregationOptions = [
    VizAggregationOptions.SUM,
    VizAggregationOptions.COUNT,
    VizAggregationOptions.MIN,
    VizAggregationOptions.MAX,
    VizAggregationOptions.FIRST,
];

export const VIZ_DEFAULT_AGGREGATION = VizAggregationOptions.COUNT;

export type VizSqlColumn = {
    reference: string;
    type: DimensionType;
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

export type VizSqlCartesianChartLayout = {
    x: {
        reference: string;
        type: VizIndexType;
    };
    y: {
        reference: string;
        aggregation: VizAggregationOptions;
    }[];
    groupBy: { reference: string }[] | undefined;
};

export type VizPieChartDisplay = {
    isDonut?: boolean;
};

// ! TODO: Rename
export type RowData = Record<string, unknown>;

// TODO: what is `type`?
export type PivotChartData = {
    results: RowData[];
    indexColumn: { reference: string; type: string };
    valuesColumns: string[];
};

export type DuckDBSqlFunction = (
    sql: string,
    rowData: RowData[],
    columns: VizSqlColumn[],
) => Promise<RowData[]>;
