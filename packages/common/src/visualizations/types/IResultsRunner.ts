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
import { type SemanticLayerQuery } from '../../types/semanticLayer';

// TODO: move these types out of here
export type PivotChartLayout = {
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

export type RunPivotQuery = (
    query: SemanticLayerQuery,
) => Promise<PivotChartData>;

export interface IResultsRunner {
    getPivotedVisualizationData(
        query: SemanticLayerQuery,
        context?: string, // TODO: pick up these changes in the pivot functions
    ): Promise<PivotChartData>;

    getColumns(): string[];

    // TODO: Remove this. Its on the table data model now
    getColumnsAccessorFn(
        column: string,
    ): (row: RawResultRow) => RawResultRow[string];

    getRows(): RawResultRow[];

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
