import { type ApiError, type ApiGetAppResponse } from '@lightdash/common';
import { useInfiniteQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import {
    ORGANIZATION_CHART_TYPES_API_BASE,
    type ChartTypeOwner,
} from '../../chartTypes/utils/chartTypeOwner';

type GetAppResult = ApiGetAppResponse['results'];

const PAGE_SIZE = 5;

const fetchAppVersions = async (
    baseUrl: string,
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
        url: `${baseUrl}/${appUuidOrSlug}?${qs}`,
        body: undefined,
    });
    return data;
};

export const useGetApp = (
    projectUuid: string | undefined,
    appUuidOrSlug: string | undefined,
    owner: ChartTypeOwner = 'project',
) => {
    const isOrganization = owner === 'organization';
    const query = useInfiniteQuery<GetAppResult, ApiError>({
        // Organization chart types are the same from every project.
        queryKey: isOrganization
            ? ['organization-chart-type', appUuidOrSlug]
            : ['app', projectUuid, appUuidOrSlug],
        queryFn: ({ pageParam }) =>
            fetchAppVersions(
                isOrganization
                    ? ORGANIZATION_CHART_TYPES_API_BASE
                    : `/ee/projects/${projectUuid}/apps`,
                appUuidOrSlug!,
                pageParam as number | undefined,
            ),
        getNextPageParam: (lastPage) => {
            if (!lastPage.hasMore || lastPage.versions.length === 0)
                return undefined;
            return lastPage.versions[lastPage.versions.length - 1].version;
        },
        enabled: (isOrganization || !!projectUuid) && !!appUuidOrSlug,
    });
    return query;
};
