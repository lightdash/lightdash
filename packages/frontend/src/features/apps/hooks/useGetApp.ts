import { type ApiError, type ApiGetAppResponse } from '@lightdash/common';
import { useInfiniteQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

type GetAppResult = ApiGetAppResponse['results'];

const PAGE_SIZE = 5;

const fetchAppVersions = async (
    projectUuid: string,
    appUuid: string,
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
        url: `/ee/projects/${projectUuid}/apps/${appUuid}?${qs}`,
        body: undefined,
    });
    return data;
};

export const useGetApp = (
    projectUuid: string | undefined,
    appUuid: string | undefined,
) => {
    const query = useInfiniteQuery<GetAppResult, ApiError>({
        queryKey: ['app', projectUuid, appUuid],
        queryFn: ({ pageParam }) =>
            fetchAppVersions(
                projectUuid!,
                appUuid!,
                pageParam as number | undefined,
            ),
        getNextPageParam: (lastPage) => {
            if (!lastPage.hasMore || lastPage.versions.length === 0)
                return undefined;
            return lastPage.versions[lastPage.versions.length - 1].version;
        },
        enabled: !!projectUuid && !!appUuid,
        // Poll every 2s while the latest version is still building
        refetchInterval: (data) => {
            const firstPage = data?.pages?.[0];
            if (!firstPage) return false;
            // First page has the newest versions (sorted desc)
            const latestVersion = firstPage.versions[0];
            if (latestVersion?.status === 'building') return 2000;
            return false;
        },
    });
    return query;
};
