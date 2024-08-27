import { type ChartKind } from '../../types/savedCharts';

export interface IChartDataModel<
    TVizChartOptions,
    TVizChartConfig,
    T extends ChartKind,
> {
    getResultOptions(): TVizChartOptions;

    mergeConfig(chartKind: T, currentConfig?: TVizChartConfig): TVizChartConfig;
}
