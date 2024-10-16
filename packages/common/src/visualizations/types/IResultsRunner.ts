import {
    type PivotChartData,
    type VizCustomMetricLayoutOptions,
    type VizIndexLayoutOptions,
    type VizValuesLayoutOptions,
} from '.';
import { type RawResultRow } from '../../types/results';
import { type SemanticLayerQuery } from '../../types/semanticLayer';

export type RunPivotQuery = (
    query: SemanticLayerQuery,
) => Promise<PivotChartData>;

export interface IResultsRunner {
    getPivotedVisualizationData(
        query: SemanticLayerQuery,
        context?: string, // TODO: pick up these changes in the pivot functions
    ): Promise<PivotChartData>;

    getColumnNames(): string[];

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
