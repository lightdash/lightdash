import {
    ApiError,
    ApiGdriveAccessTokenResponse,
    ApiScheduledDownloadCsv,
    UploadMetricGsheet,
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

export const uploadGsheet = async (gsheetMetric: UploadMetricGsheet) => {
    const timezoneFixQuery = {
        ...gsheetMetric.metricQuery,
        filters: convertDateFilters(gsheetMetric.metricQuery.filters),
    };
    return lightdashApi<ApiScheduledDownloadCsv>({
        url: `/gdrive/upload-gsheet`,
        method: 'POST',
        body: JSON.stringify({
            ...gsheetMetric,
            metricQuery: timezoneFixQuery,
        }),
    });
};
