import {
    type ApiVerifiedContentListResponse,
    type DashboardBasicDetails,
    type SpaceQuery,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../api';

const getVerifiedContent = async (projectUuid: string) =>
    lightdashApi<ApiVerifiedContentListResponse['results']>({
        url: `/projects/${projectUuid}/content-verification`,
        method: 'GET',
        body: undefined,
    });

export const useVerifiedContentList = (projectUuid: string) => {
    return useQuery({
        queryKey: ['verified-content', projectUuid],
        queryFn: () => getVerifiedContent(projectUuid),
    });
};

const getVerifiedContentForHomepage = async (projectUuid: string) =>
    lightdashApi<(DashboardBasicDetails | SpaceQuery)[]>({
        url: `/projects/${projectUuid}/verified-content-homepage`,
        method: 'GET',
        body: undefined,
    });

export const useVerifiedContentForHomepage = (
    projectUuid: string | undefined,
) =>
    useQuery({
        queryKey: ['verified-content-homepage', projectUuid],
        queryFn: () => getVerifiedContentForHomepage(projectUuid!),
        enabled: !!projectUuid,
    });
