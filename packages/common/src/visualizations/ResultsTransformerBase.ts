export type RowData = Record<string, unknown>;

export type CartesianChartData = {
    results: RowData[];
    xAxisColumn: { reference: string; type: string };
    seriesColumns: string[];
};

export type PieChartData = {
    results: RowData[];
};

export interface ResultsTransformerBase<
    CartesianChartConfigType,
    PieChartConfigType,
> {
    transformCartesianChartData(
        config: CartesianChartConfigType,
    ): Promise<CartesianChartData>;

    transformPieChartData(config: PieChartConfigType): Promise<PieChartData>;
}
