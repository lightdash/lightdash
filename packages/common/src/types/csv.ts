import { type MetricQuery } from './metricQuery';
import { type PivotConfig } from './pivot';

export type DownloadMetricCsv = {
    userUuid: string;
    projectUuid: string;
    exploreId: string;
    metricQuery: MetricQuery;
    onlyRaw: boolean;
    csvLimit: number | null | undefined;
    showTableNames: boolean;
    customLabels: Record<string, string> | undefined;
    columnOrder: string[];
    hiddenFields: string[] | undefined;
    chartName: string | undefined;
    fromSavedChart: boolean;
    pivotConfig?: PivotConfig;
};
