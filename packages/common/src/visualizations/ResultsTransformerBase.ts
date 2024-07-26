export type RowData = Record<string, unknown>;

export type BarChartData = {
    results: RowData[];
    xAxisColumn: string;
    seriesColumns: string[];
};

export interface ResultsTransformerBase<BarChartConfigType> {
    transformBarChartData(config: BarChartConfigType): Promise<BarChartData>;
}
