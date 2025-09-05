import {
    type ApiError,
    type ApiUserActivityDownloadCsv,
    type UnusedContent,
    type UserActivity,
} from '@lightdash/common';
import { useMutation, useQuery } from '@tanstack/react-query';

import { lightdashApi } from '../../api';
import useQueryError from '../useQueryError';

const getUserActivity = async (projectUuid: string) =>
    lightdashApi<UserActivity>({
        url: `/analytics/user-activity/${projectUuid}`,
        method: 'GET',
        body: undefined,
    });

export const useUserActivity = (projectUuid?: string) => {
    const setErrorResponse = useQueryError();
    return useQuery<UserActivity, ApiError>({
        queryKey: ['user_activity', projectUuid],
        queryFn: () => getUserActivity(projectUuid || ''),
        enabled: projectUuid !== undefined,
        retry: false,
        onError: (result) => setErrorResponse(result),
    });
};

const downloadUserActivityCsv = async (projectUuid: string) =>
    lightdashApi<ApiUserActivityDownloadCsv['results']>({
        url: `/analytics/user-activity/${projectUuid}/download`,
        method: 'POST',
        body: undefined,
    });

export const useDownloadUserActivityCsv = () => {
    return useMutation<ApiUserActivityDownloadCsv['results'], ApiError, string>(
        downloadUserActivityCsv,
        {
            mutationKey: ['download_user_activity_csv'],
        },
    );
};

const getUnusedContent = async (projectUuid: string) =>
    lightdashApi<UnusedContent>({
        url: `/analytics/user-activity/${projectUuid}/unused-content`,
        method: 'GET',
        body: undefined,
    });

export const useUnusedContent = (projectUuid?: string) => {
    const setErrorResponse = useQueryError();
    return useQuery<UnusedContent, ApiError>({
        queryKey: ['unused_content', projectUuid],
        queryFn: () => getUnusedContent(projectUuid || ''),
        enabled: projectUuid !== undefined,
        retry: false,
        onError: (result) => setErrorResponse(result),
    });
};
