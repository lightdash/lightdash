import {
    type ApiVerifiedContentListResponse,
    type DashboardBasicDetails,
    type SpaceQuery,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { type LightdashApi } from '../api';
import { useLightdashApi } from '../providers/LightdashApi/useLightdashApi';

const getVerifiedContent = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
) =>
    lightdashApi<ApiVerifiedContentListResponse['results']>({
        url: `/projects/${projectUuid}/content-verification`,
        method: 'GET',
        body: undefined,
    });

export const useVerifiedContentList = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();
    return useQuery({
        queryKey: ['verified-content', projectUuid],
        queryFn: () => getVerifiedContent(lightdashApi, projectUuid),
    });
};

const getVerifiedContentForHomepage = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
) =>
    lightdashApi<(DashboardBasicDetails | SpaceQuery)[]>({
        url: `/projects/${projectUuid}/verified-content-homepage`,
        method: 'GET',
        body: undefined,
    });

export const useVerifiedContentForHomepage = (
    projectUuid: string | undefined,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery({
        queryKey: ['verified-content-homepage', projectUuid],
        queryFn: () =>
            getVerifiedContentForHomepage(lightdashApi, projectUuid!),
        enabled: !!projectUuid,
    });
};
