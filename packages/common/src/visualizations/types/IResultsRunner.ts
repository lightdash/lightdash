import {
    type PivotChartData,
    type VizAggregationOptions,
    type VizCustomMetricLayoutOptions,
    type VizIndexLayoutOptions,
    type VizIndexType,
    type VizSortBy,
    type VizValuesLayoutOptions,
} from '.';
import { type DimensionType } from '../../types/field';
import { type RawResultRow } from '../../types/results';

// TODO: move these types out of here
export type SqlRunnerPivotChartLayout = {
    x:
        | {
              reference: string;
              axisType: VizIndexType;
              dimensionType: DimensionType;
          }
        | undefined;
    y: {
        reference: string;
        aggregation: VizAggregationOptions;
    }[];
    groupBy: { reference: string }[] | undefined;
    sortBy?: VizSortBy[];
};

export type SemanticViewerPivotChartLayout = {
    x:
        | {
              reference: string;
              axisType: VizIndexType;
              dimensionType: DimensionType;
          }
        | undefined;
    y: {
        reference: string;
        aggregation: VizAggregationOptions;
    }[];
    groupBy: { reference: string }[] | undefined;
    sortBy?: VizSortBy[];
};

// TODO: these types should be somewhere else
export type PivotChartLayout =
    | SqlRunnerPivotChartLayout
    | SemanticViewerPivotChartLayout;

export interface IResultsRunner {
    // Includes bar, chart, line, pie, scatter, and table v1(?)

    // Why does this have so many parameters not relevant to the runner?
    // Can this operate on almost no params?
    getPivotedVisualizationData(
        config: PivotChartLayout,
        sql?: string,
        projectUuid?: string,
        limit?: number,
        slug?: string,
        uuid?: string,
    ): Promise<PivotChartData>;

    // Sql specific?
    getColumns(): string[];

    // Sql specific?
    getColumnsAccessorFn(
        column: string,
    ): (row: RawResultRow) => RawResultRow[string];

    getRows(): RawResultRow[];

    // TODO getDimensions and getMetrics should be removed when the new ones work
    getDimensions(): VizIndexLayoutOptions[];
    getMetrics(): VizValuesLayoutOptions[];

    getPivotQueryDimensions(): VizIndexLayoutOptions[];

    getPivotQueryMetrics(): VizValuesLayoutOptions[];

    getPivotQueryCustomMetrics(): VizCustomMetricLayoutOptions[];

    // TODO: other runner types
    // getPivotTableData() // includes subtotalling etc.
    // getEventAnalyticsData() // funnel building + sankey
    // getTimeSeriesData() // period-over-period and overlay multiple time series
    // getMapData() // detailed mapping
    // where does big number live?
}
