import {
    type ApiCsvUrlResponse,
    type ApiDownloadCsv,
    type ApiScheduledDownloadCsv,
    type DashboardFilters,
    type MetricQuery,
} from '@lightdash/common';

import { lightdashApi } from '../api';
import { convertDateFilters } from '../utils/dateFilter';

export const downloadCsv = async ({
    projectUuid,
    tableId,
    query,
    csvLimit,
    onlyRaw,
    showTableNames,
    columnOrder,
    customLabels,
    hiddenFields,
    chartName,
    pivotColumns,
}: {
    projectUuid: string;
    tableId: string;
    query: MetricQuery;
    csvLimit?: number | null; //giving null returns all results (no limit)
    onlyRaw: boolean;
    showTableNames: boolean;
    columnOrder: string[];
    customLabels?: Record<string, string>;
    hiddenFields?: string[];
    chartName?: string;
    pivotColumns?: string[];
}) => {
    const timezoneFixQuery = {
        ...query,
        filters: convertDateFilters(query.filters),
    };
    return lightdashApi<ApiScheduledDownloadCsv>({
        url: `/projects/${projectUuid}/explores/${tableId}/downloadCsv`,
        method: 'POST',
        body: JSON.stringify({
            ...timezoneFixQuery,
            csvLimit,
            onlyRaw,
            showTableNames,
            customLabels,
            columnOrder,
            hiddenFields,
            chartName,
            timezone: query.timezone ?? undefined,
            pivotColumns,
        }),
    });
};

export const downloadCsvFromSavedChart = async ({
    chartUuid,
    dashboardFilters,
    tileUuid,
    csvLimit,
    onlyRaw,
}: {
    chartUuid: string;
    dashboardFilters?: DashboardFilters;
    tileUuid?: string;
    // Csv properties
    onlyRaw: boolean;
    csvLimit: number | null | undefined;
}) => {
    /* TODO fix dashboardFilters timezone 
    const timezoneFixQuery = {
        ...query,
        filters: convertDateFilters(query.filters),
    };*/
    return lightdashApi<ApiScheduledDownloadCsv>({
        url: `/saved/${chartUuid}/downloadCsv`,
        method: 'POST',
        body: JSON.stringify({
            dashboardFilters,
            tileUuid,
            csvLimit,
            onlyRaw,
        }),
    });
};

export const getCsvFileUrl = async ({ jobId }: ApiScheduledDownloadCsv) =>
    lightdashApi<ApiDownloadCsv>({
        url: `/csv/${jobId}`,
        method: 'GET',
        body: undefined,
    });

export const pollCsvFileUrl = async ({ jobId }: ApiScheduledDownloadCsv) =>
    new Promise<ApiCsvUrlResponse['results']>((resolve, reject) => {
        const poll = () => {
            getCsvFileUrl({ jobId })
                .then((data) => {
                    if (data.url) {
                        resolve(data);
                    } else {
                        setTimeout(poll, 2000);
                    }
                })
                .catch((error) => {
                    reject(error);
                });
        };

        poll();
    });

export const downloadCsvFromSqlRunner = async ({
    projectUuid,
    sql,
    customLabels,
}: {
    projectUuid: string;
    sql: string;
    customLabels?: Record<string, string>;
}) =>
    lightdashApi<ApiDownloadCsv>({
        url: `/projects/${projectUuid}/sqlRunner/downloadCsv`,
        method: 'POST',
        body: JSON.stringify({ sql, customLabels }),
    });
