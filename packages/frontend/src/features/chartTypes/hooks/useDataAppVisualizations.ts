import {
    type ApiError,
    type ApiListDataAppVizsResponse,
    type ApiListOrganizationDataAppVizsResponse,
    type DataAppVizListSort,
    DEFAULT_DATA_APP_VIZ_LIST_SORT,
} from '@lightdash/common';
import { useInfiniteQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useEmbed from '../../../ee/providers/Embed/useEmbed';
import { ORGANIZATION_CHART_TYPES_API_BASE } from '../utils/chartTypeOwner';

type DataAppVizsPage = ApiListDataAppVizsResponse['results'];
type OrganizationDataAppVizsPage =
    ApiListOrganizationDataAppVizsResponse['results'];

const getListParams = (
    page: number,
    pageSize: number,
    search: string,
    sort: DataAppVizListSort,
): URLSearchParams => {
    const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sortBy: sort.sortBy,
        sortDirection: sort.sortDirection,
    });
    if (search) {
        params.set('search', search);
    }
    return params;
};

const getNextPageParam = (
    lastPage: { pagination?: { totalPageCount: number } },
    pages: unknown[],
) => {
    const totalPages = lastPage.pagination?.totalPageCount ?? 0;
    return pages.length < totalPages ? pages.length + 1 : undefined;
};

const getDataAppVisualizations = async (
    projectUuid: string,
    page: number,
    pageSize: number,
    search: string,
    sort: DataAppVizListSort,
    isEmbedded: boolean,
): Promise<DataAppVizsPage> => {
    const params = getListParams(page, pageSize, search, sort);
    const baseUrl = isEmbedded
        ? `/embed/${projectUuid}/visualizations`
        : `/ee/projects/${projectUuid}/apps/visualizations`;
    return lightdashApi<DataAppVizsPage>({
        method: 'GET',
        url: `${baseUrl}?${params.toString()}`,
        body: undefined,
    });
};

const FETCH_SIZE = 25;

// Lists the project's saved data app vizs (paginated, optionally filtered by
// `search`) for the library picker.
export const useDataAppVisualizations = (
    projectUuid: string | undefined,
    search: string = '',
    sort: DataAppVizListSort = DEFAULT_DATA_APP_VIZ_LIST_SORT,
    pageSize: number = FETCH_SIZE,
) => {
    const { embedToken } = useEmbed();
    const isEmbedded = !!embedToken;
    return useInfiniteQuery<DataAppVizsPage, ApiError>({
        queryKey: [
            'data-app-vizs',
            projectUuid,
            pageSize,
            search,
            sort.sortBy,
            sort.sortDirection,
            isEmbedded ? 'embed' : 'registered',
        ],
        queryFn: ({ pageParam = 1 }) =>
            getDataAppVisualizations(
                projectUuid!,
                pageParam as number,
                pageSize,
                search,
                sort,
                isEmbedded,
            ),
        getNextPageParam,
        enabled: !!projectUuid,
        keepPreviousData: true,
        refetchOnWindowFocus: false,
    });
};

// Lists the organization library's chart types, the same from every project.
export const useOrganizationDataAppVisualizations = (
    search: string,
    enabled: boolean,
    sort: DataAppVizListSort = DEFAULT_DATA_APP_VIZ_LIST_SORT,
    pageSize: number = FETCH_SIZE,
) =>
    useInfiniteQuery<OrganizationDataAppVizsPage, ApiError>({
        queryKey: [
            'organization-data-app-vizs',
            pageSize,
            search,
            sort.sortBy,
            sort.sortDirection,
        ],
        queryFn: ({ pageParam = 1 }) =>
            lightdashApi<OrganizationDataAppVizsPage>({
                method: 'GET',
                url: `${ORGANIZATION_CHART_TYPES_API_BASE}?${getListParams(
                    pageParam as number,
                    pageSize,
                    search,
                    sort,
                ).toString()}`,
                body: undefined,
            }),
        getNextPageParam,
        enabled,
        keepPreviousData: true,
        refetchOnWindowFocus: false,
    });
