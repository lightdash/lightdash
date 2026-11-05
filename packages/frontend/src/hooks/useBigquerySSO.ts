import {
    type ApiBigqueryDatasets,
    type ApiBigqueryProjectRecommendation,
    type ApiBigqueryProjects,
    type ApiError,
    type ApiSuccessEmpty,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { type LightdashApi } from '../api';
import { useLightdashApi } from '../providers/LightdashApi/useLightdashApi';

const getIsAuthenticated = async (lightdashApi: LightdashApi) =>
    lightdashApi<ApiSuccessEmpty['results']>({
        url: `/bigquery/sso/is-authenticated`,
        method: 'GET',
        body: undefined,
    });

export const useIsBigQueryAuthenticated = () => {
    const lightdashApi = useLightdashApi();
    return useQuery<ApiSuccessEmpty['results'], ApiError>({
        queryKey: [],
        queryFn: () => getIsAuthenticated(lightdashApi),
    });
};

const getProjects = async (lightdashApi: LightdashApi) =>
    lightdashApi<ApiBigqueryProjects['results']>({
        url: `/bigquery/sso/projects`,
        method: 'GET',
        body: undefined,
    });

export const useBigqueryProjects = (isAuthenticated: boolean) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ApiBigqueryProjects['results'], ApiError>({
        queryKey: ['bigquery-projects'],
        queryFn: () => getProjects(lightdashApi),
        enabled: isAuthenticated,
    });
};

const getProjectRecommendation = async (lightdashApi: LightdashApi) =>
    lightdashApi<ApiBigqueryProjectRecommendation['results']>({
        url: `/bigquery/sso/projects/recommendation`,
        method: 'GET',
        body: undefined,
    });

export const useBigqueryProjectRecommendation = (enabled: boolean) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ApiBigqueryProjectRecommendation['results'], ApiError>({
        queryKey: ['bigquery-project-recommendation'],
        queryFn: () => getProjectRecommendation(lightdashApi),
        enabled,
    });
};

const getDatasets = async (lightdashApi: LightdashApi, projectId: string) =>
    lightdashApi<ApiBigqueryDatasets['results']>({
        url: `/bigquery/sso/datasets?projectId=${projectId}`,
        method: 'GET',
        body: undefined,
    });

export const useBigqueryDatasets = (
    isAuthenticated: boolean,
    projectId: string | undefined,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ApiBigqueryDatasets['results'], ApiError>({
        queryKey: [projectId],
        queryFn: () => getDatasets(lightdashApi, projectId!),
        enabled:
            isAuthenticated && projectId !== undefined && projectId.length > 0,
    });
};

const getKeyfileDatasets = async (
    lightdashApi: LightdashApi,
    keyfileContents: Record<string, string>,
) =>
    lightdashApi<ApiBigqueryDatasets['results']>({
        url: `/bigquery/datasets`,
        method: 'POST',
        body: JSON.stringify({ keyfileContents }),
    });

/** Datasets a service account key can see; a metadata call, no queries run */
export const useBigqueryKeyfileDatasets = (
    keyfileContents: Record<string, string> | undefined,
) => {
    const lightdashApi = useLightdashApi();
    const projectId = keyfileContents?.project_id;
    const clientEmail = keyfileContents?.client_email;
    return useQuery<ApiBigqueryDatasets['results'], ApiError>({
        // The key itself stays out of the cache key
        queryKey: [
            'bigquery-keyfile-datasets',
            projectId,
            clientEmail,
            keyfileContents?.private_key_id,
        ],
        queryFn: () => getKeyfileDatasets(lightdashApi, keyfileContents!),
        enabled:
            typeof projectId === 'string' &&
            typeof keyfileContents?.private_key === 'string',
        retry: false,
        staleTime: Infinity,
    });
};
