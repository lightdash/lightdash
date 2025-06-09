import {
    type ApiBigqueryDatasets,
    type ApiError,
    type ApiSuccessEmpty,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../api';

const getIsAuthenticated = async () =>
    lightdashApi<ApiSuccessEmpty['results']>({
        url: `/bigquery/sso/is-authenticated`,
        method: 'GET',
        body: undefined,
    });

export const useIsBigQueryAuthenticated = () => {
    return useQuery<ApiSuccessEmpty['results'], ApiError>({
        queryKey: [],
        queryFn: getIsAuthenticated,
    });
};

const getDatasets = async (projectId: string) =>
    lightdashApi<ApiBigqueryDatasets['results']>({
        url: `/bigquery/sso/datasets?projectId=${projectId}`,
        method: 'GET',
        body: undefined,
    });

export const useBigqueryDatasets = (
    isAuthenticated: boolean,
    projectId: string | undefined,
) => {
    return useQuery<ApiBigqueryDatasets['results'], ApiError>({
        queryKey: [projectId],
        queryFn: () => getDatasets(projectId!),
        enabled:
            isAuthenticated && projectId !== undefined && projectId.length > 0,
    });
};
