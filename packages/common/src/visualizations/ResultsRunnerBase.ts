export type RowData = Record<string, unknown>;

export type PivotChartData = {
    results: RowData[];
    indexColumn: { reference: string; type: string };
    valuesColumns: string[];
};

export type PieChartData = {
    results: RowData[];
};

// TODO: combine pivot chart + pie chart methods
export interface ResultsRunnerBase<TPivotChartLayout, TPieChartLayout> {
    // Includes bar, chart, line, pie, scatter, and table v1(?)
    getPivotChartData(config: TPivotChartLayout): Promise<PivotChartData>;

    defaultPivotChartLayout(): TPivotChartLayout | undefined;

    // TODO: remove these - can use getPivotChartData
    getPieChartData(config: TPieChartLayout): Promise<PieChartData>;

    defaultPieChartLayout(): TPieChartLayout | undefined;

    // TODO: other runner types
    // getPivotTableData() // includes subtotalling etc.
    // getEventAnalyticsData() // funnel building + sankey
    // getTimeSeriesData() // period-over-period and overlay multiple time series
    // getMapData() // detailed mapping

    // where does big number live?
}
