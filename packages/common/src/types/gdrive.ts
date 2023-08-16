import { MetricQuery } from './metricQuery';

export type ApiGdriveAccessTokenResponse = {
    status: 'ok';
    results: string;
};

export type UploadMetricGsheet = {
    userUuid: string;
    projectUuid: string;
    exploreId: string;
    metricQuery: MetricQuery;
    onlyRaw: boolean;
    csvLimit: number | null | undefined;
    showTableNames: boolean;
    customLabels: Record<string, string> | undefined;
    columnOrder: string[];
};
