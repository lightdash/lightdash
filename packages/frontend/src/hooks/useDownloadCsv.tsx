import { ApiDownloadCsv, MetricQuery } from '@lightdash/common';

import { lightdashApi } from '../api';
import { convertDateFilters } from '../utils/dateFilter';

export const downloadCsv = async ({
    projectUuid,
    tableId,
    query,
    csvLimit,
    onlyRaw,
    showTableNames,
    customLabels,
}: {
    projectUuid: string;
    tableId: string;
    query: MetricQuery;
    csvLimit?: number | null; //giving null returns all results (no limit)
    onlyRaw: boolean;
    showTableNames: boolean;
    customLabels?: Record<string, string>;
}) => {
    const timezoneFixQuery = convertDateFilters(query);
    return lightdashApi<ApiDownloadCsv>({
        url: `/projects/${projectUuid}/explores/${tableId}/downloadCsv`,
        method: 'POST',
        body: JSON.stringify({
            ...timezoneFixQuery,
            csvLimit,
            onlyRaw,
            showTableNames,
            customLabels,
        }),
    });
};

export const downloadCsvFromSqlRunner = async ({
    projectUuid,
    sql,
}: {
    projectUuid: string;
    sql: string;
}) => {
    return lightdashApi<ApiDownloadCsv>({
        url: `/projects/${projectUuid}/sqlRunner/downloadCsv`,
        method: 'POST',
        body: JSON.stringify({ sql }),
    });
};
