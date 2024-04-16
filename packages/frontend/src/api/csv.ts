import {
    type ApiCsvUrlResponse,
    type ApiDownloadCsv,
    type ApiScheduledDownloadCsv,
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
