import {
    ApiCsvUrlResponse,
    ApiDownloadCsv,
    ApiScheduledDownloadCsv,
    MetricQuery,
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
