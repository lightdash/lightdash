import { type PivotChartData, type VizCartesianChartOptions } from '.';

export interface IResultsRunner<TPivotChartLayout, TRow> {
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

    pivotChartOptions(): VizCartesianChartOptions;

    getColumns(): string[];

    getRows(): TRow[];

    // TODO: other runner types
    // getPivotTableData() // includes subtotalling etc.
    // getEventAnalyticsData() // funnel building + sankey
    // getTimeSeriesData() // period-over-period and overlay multiple time series
    // getMapData() // detailed mapping
    // where does big number live?
}
