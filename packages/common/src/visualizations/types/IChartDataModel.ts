import { type ChartKind } from '../../types/savedCharts';

export interface IChartDataModel<
    TVizChartOptions,
    TVizChartConfig,
    TVizChartDisplay,
    T extends ChartKind,
> {
    getResultOptions(): TVizChartOptions;

    mergeConfig(chartKind: T, display?: TVizChartDisplay): TVizChartConfig;
}
