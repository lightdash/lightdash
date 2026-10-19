import { type ApiError, type ApiGetAppResponse } from '@lightdash/common';
import { useInfiniteQuery } from '@tanstack/react-query';
import { type LightdashApi } from '../../../api';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

type GetAppResult = ApiGetAppResponse['results'];

const PAGE_SIZE = 5;

const fetchAppVersions = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    appUuidOrSlug: string,
    beforeVersion?: number,
): Promise<GetAppResult> => {
    const params = new URLSearchParams();
    if (beforeVersion !== undefined) {
        params.set('beforeVersion', String(beforeVersion));
    }
    params.set('limit', String(PAGE_SIZE));
    const qs = params.toString();
    const data = await lightdashApi<GetAppResult>({
        method: 'GET',
        url: `/ee/projects/${projectUuid}/apps/${appUuidOrSlug}?${qs}`,
        body: undefined,
    });
    return data;
};

export const useGetApp = (
    projectUuid: string | undefined,
    appUuidOrSlug: string | undefined,
) => {
    const lightdashApi = useLightdashApi();
    const query = useInfiniteQuery<GetAppResult, ApiError>({
        queryKey: ['app', projectUuid, appUuidOrSlug],
        queryFn: ({ pageParam }) =>
            fetchAppVersions(
                lightdashApi,
                projectUuid!,
                appUuidOrSlug!,
                pageParam as number | undefined,
            ),
        getNextPageParam: (lastPage) => {
            if (!lastPage.hasMore || lastPage.versions.length === 0)
                return undefined;
            return lastPage.versions[lastPage.versions.length - 1].version;
        },
        enabled: !!projectUuid && !!appUuidOrSlug,
    });
    return query;
};
