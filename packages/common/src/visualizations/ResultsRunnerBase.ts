import { type PivotChartData } from './types';

export interface ResultsRunnerBase<TPivotChartLayout> {
    // Includes bar, chart, line, pie, scatter, and table v1(?)
    getPivotChartData(
        config: TPivotChartLayout,
        sql?: string,
        projectUuid?: string,
        limit?: number,
    ): Promise<PivotChartData>;

    defaultPivotChartLayout(): TPivotChartLayout | undefined;

    mergePivotChartLayout(
        existingConfig?: TPivotChartLayout,
    ): TPivotChartLayout | undefined;

    // TODO: other runner types
    // getPivotTableData() // includes subtotalling etc.
    // getEventAnalyticsData() // funnel building + sankey
    // getTimeSeriesData() // period-over-period and overlay multiple time series
    // getMapData() // detailed mapping

    // where does big number live?
}
