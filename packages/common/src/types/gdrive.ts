import { type MetricQueryResponse } from './metricQuery';

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
};

export type UploadMetricGsheetPayload = UploadMetricGsheet & {
    userUuid: string;
    organizationUuid?: string;
};
