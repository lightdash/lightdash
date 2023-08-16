import {
    ApiError,
    ApiGdriveAccessTokenResponse,
    ApiScheduledDownloadCsv,
    MetricQuery,
} from '@lightdash/common';
import { useQuery } from 'react-query';
import { lightdashApi } from '../../api';
import { convertDateFilters } from '../../utils/dateFilter';

const getGdriveAccessToken = async () =>
    lightdashApi<ApiGdriveAccessTokenResponse['results']>({
        url: `/gdrive/get-access-token`,
        method: 'GET',
        body: undefined,
    });

export const useGdriveAccessToken = () =>
    useQuery<ApiGdriveAccessTokenResponse['results'], ApiError>({
        queryKey: ['gdrive_access_token'],
        queryFn: getGdriveAccessToken,
        retry: false,
    });

export const uploadGsheet = async ({
    projectUuid,
    tableId,
    query,
    showTableNames,
    columnOrder,
    customLabels,
}: {
    projectUuid: string;
    tableId: string;
    query: MetricQuery;
    showTableNames: boolean;
    columnOrder: string[];
    customLabels?: Record<string, string>;
}) => {
    const timezoneFixQuery = {
        ...query,
        filters: convertDateFilters(query.filters),
    };
    return lightdashApi<ApiScheduledDownloadCsv>({
        url: `/gdrive/upload-gsheet`,
        method: 'POST',
        body: JSON.stringify({
            ...timezoneFixQuery,
            tableId,
            projectUuid,
            csvLimit: undefined,
            onlyRaw: true,
            showTableNames,
            customLabels,
            columnOrder,
        }),
    });
};
