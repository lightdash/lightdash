import { ApiDownloadCsv, MetricQuery } from '@lightdash/common';

import { lightdashApi } from '../api';
import { convertDateFilters } from '../utils/dateFilter';
import useToaster from './toaster/useToaster';

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
            columnOrder,
        }),
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
