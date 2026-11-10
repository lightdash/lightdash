import {
    type ApiError,
    type ApiUserActivityDownloadCsv,
    type UserActivity,
} from '@lightdash/common';
import { useMutation, useQuery } from '@tanstack/react-query';
import { type LightdashApi } from '../../api';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import useQueryError from '../useQueryError';

const getUserActivity = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
) =>
    lightdashApi<UserActivity>({
        url: `/analytics/user-activity/${projectUuid}`,
        method: 'GET',
        body: undefined,
    });

export const useUserActivity = (projectUuid?: string) => {
    const lightdashApi = useLightdashApi();
    const setErrorResponse = useQueryError();
    return useQuery<UserActivity, ApiError>({
        queryKey: ['user_activity', projectUuid],
        queryFn: () => getUserActivity(lightdashApi, projectUuid || ''),
        enabled: projectUuid !== undefined,
        retry: false,
        onError: (result) => setErrorResponse(result),
    });
};

const downloadUserActivityCsv = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
) =>
    lightdashApi<ApiUserActivityDownloadCsv['results']>({
        url: `/analytics/user-activity/${projectUuid}/download`,
        method: 'POST',
        body: undefined,
    });

export const useDownloadUserActivityCsv = () => {
    const lightdashApi = useLightdashApi();
    const setErrorResponse = useQueryError();
    return useMutation<ApiUserActivityDownloadCsv['results'], ApiError, string>(
        (projectUuid: string) =>
            downloadUserActivityCsv(lightdashApi, projectUuid),
        {
            mutationKey: ['download_user_activity_csv'],
            onError: (result) => setErrorResponse(result),
        },
    );
};
