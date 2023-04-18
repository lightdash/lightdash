import {
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
}: {
    projectUuid: string;
    tableId: string;
    query: MetricQuery;
    csvLimit?: number | null; //giving null returns all results (no limit)
    onlyRaw: boolean;
    showTableNames: boolean;
    columnOrder: string[];
    customLabels?: Record<string, string>;
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
        }),
    });
};

export const getCsvFileUrl = async (
    { jobId }: ApiScheduledDownloadCsv,
    onSuccess: (data: string) => void,
    onError: (error: Error) => void,
) => {
    lightdashApi<ApiDownloadCsv>({
        url: `/csv/${jobId}`,
        method: 'GET',
        body: undefined,
    })
        .then((data) => {
            if (data.url) {
                return onSuccess(data.url);
            } else {
                setTimeout(
                    () => getCsvFileUrl({ jobId }, onSuccess, onError),
                    2000,
                );
            }
        })
        .catch((error) => {
            return onError(error);
        });
};

export const pollCsvFileUrl = async ({ jobId }: ApiScheduledDownloadCsv) => {
    return new Promise<string>((resolve, reject) => {
        getCsvFileUrl(
            { jobId },
            (url) => resolve(url),
            (error) => reject(error),
        );
    });
};
export const downloadCsvFromSqlRunner = async ({
    projectUuid,
    sql,
    customLabels,
}: {
    projectUuid: string;
    sql: string;
    customLabels?: Record<string, string>;
}) => {
    return lightdashApi<ApiDownloadCsv>({
        url: `/projects/${projectUuid}/sqlRunner/downloadCsv`,
        method: 'POST',
        body: JSON.stringify({ sql, customLabels }),
    });
};
