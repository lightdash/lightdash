import { MetricQuery } from './metricQuery';

export type ApiGdriveAccessTokenResponse = {
    status: 'ok';
    results: string;
};

export type UploadMetricGsheet = {
    projectUuid: string;
    exploreId: string;
    metricQuery: MetricQuery;
    showTableNames: boolean;
    columnOrder: string[];
};

export type UploadMetricGsheetPayload = UploadMetricGsheet & {
    userUuid: string;
};
