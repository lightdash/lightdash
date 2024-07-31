export type RowData = Record<string, unknown>;

export type BarChartData = {
    results: RowData[];
    xAxisColumn: string;
    seriesColumns: string[];
};

export type PieChartData = {
    results: RowData[];
};

export interface ResultsTransformerBase<
    BarChartConfigType,
    PieChartConfigType,
> {
    transformBarChartData(config: BarChartConfigType): Promise<BarChartData>;
    transformPieChartData(config: PieChartConfigType): Promise<PieChartData>;
}
