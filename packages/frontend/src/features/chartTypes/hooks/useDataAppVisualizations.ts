import {
    type ApiError,
    type ApiListDataAppVizsResponse,
    type DataAppVizListSort,
    DEFAULT_DATA_APP_VIZ_LIST_SORT,
} from '@lightdash/common';
import { useInfiniteQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

type DataAppVizsPage = ApiListDataAppVizsResponse['results'];

const getDataAppVisualizations = async (
    projectUuid: string,
    page: number,
    pageSize: number,
    search: string,
    sort: DataAppVizListSort,
): Promise<DataAppVizsPage> => {
    const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sortBy: sort.sortBy,
        sortDirection: sort.sortDirection,
    });
    if (search) {
        params.set('search', search);
    }
    return lightdashApi<DataAppVizsPage>({
        method: 'GET',
        url: `/ee/projects/${projectUuid}/apps/visualizations?${params.toString()}`,
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
) =>
    useInfiniteQuery<DataAppVizsPage, ApiError>({
        queryKey: [
            'data-app-vizs',
            projectUuid,
            FETCH_SIZE,
            search,
            sort.sortBy,
            sort.sortDirection,
        ],
        queryFn: ({ pageParam = 1 }) =>
            getDataAppVisualizations(
                projectUuid!,
                pageParam as number,
                FETCH_SIZE,
                search,
                sort,
            ),
        getNextPageParam: (lastPage, pages) => {
            const totalPages = lastPage.pagination?.totalPageCount ?? 0;
            return pages.length < totalPages ? pages.length + 1 : undefined;
        },
        enabled: !!projectUuid,
        keepPreviousData: true,
        refetchOnWindowFocus: false,
    });
