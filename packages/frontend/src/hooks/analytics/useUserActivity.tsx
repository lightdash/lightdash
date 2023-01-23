import {
    ApiError,
    CreateDashboard,
    Dashboard,
    DashboardTile,
    FilterableField,
    isDashboardChartTileType,
    UpdateDashboard,
    UpdateDashboardDetails,
    UserActivity,
} from '@lightdash/common';
import { useMemo, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from 'react-query';
import { UseQueryOptions, UseQueryResult } from 'react-query/types/react/types';
import { useHistory, useParams } from 'react-router-dom';
import { useDeepCompareEffect } from 'react-use';
import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';
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
