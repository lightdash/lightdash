import { type MetricQueryResponse } from './metricQuery';
import { type PivotConfig } from './pivot';
import { type TraceTaskBase } from './scheduler';

export type ApiGdriveAccessTokenResponse = {
    status: 'ok';
    results: string;
};

export type CustomLabel = {
    [key: string]: string;
};
export type UploadMetricGsheet = {
    projectUuid: string;
    exploreId: string;
    metricQuery: MetricQueryResponse; // tsoa doesn't support complex types like MetricQuery
    showTableNames: boolean;
    columnOrder: string[];
    customLabels?: CustomLabel;
    hiddenFields?: string[];
    pivotConfig?: PivotConfig;
};

export type UploadMetricGsheetPayload = TraceTaskBase & UploadMetricGsheet;
