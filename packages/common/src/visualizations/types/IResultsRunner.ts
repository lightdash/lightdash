import {
    type PivotChartData,
    type VizCustomMetricLayoutOptions,
    type VizIndexLayoutOptions,
    type VizValuesLayoutOptions,
} from '.';
import { type RawResultRow } from '../../types/results';
import { type SqlRunnerQuery } from '../../types/sqlRunner';

export type RunPivotQuery = (query: SqlRunnerQuery) => Promise<PivotChartData>;

export interface IResultsRunner {
    getPivotedVisualizationData(
        query: SqlRunnerQuery,
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
