import {
    type ApiCreateDashboardSchedulerResponse,
    type ApiDashboardPaginatedSchedulersResponse,
    type ApiError,
    type CreateSchedulerAndTargetsWithoutIds,
    type KnexPaginateArgs,
} from '@lightdash/common';
import {
    useInfiniteQuery,
    useMutation,
    useQueryClient,
} from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

type DashboardSchedulersResponse =
    ApiDashboardPaginatedSchedulersResponse['results'];

const getDashboardSchedulers = async (
    uuid: string,
    paginateArgs: KnexPaginateArgs,
    searchQuery?: string,
) => {
    const params = new URLSearchParams({
        page: paginateArgs.page.toString(),
        pageSize: paginateArgs.pageSize.toString(),
    });

    if (searchQuery) {
        params.set('searchQuery', searchQuery);
    }

    return lightdashApi<DashboardSchedulersResponse>({
        url: `/dashboards/${uuid}/schedulers?${params.toString()}`,
        method: 'GET',
        body: undefined,
        version: 'v2',
    });
};

export type UseDashboardSchedulersParams = {
    dashboardUuid: string;
    searchQuery?: string;
    pageSize?: number;
};

export const useDashboardSchedulers = ({
    dashboardUuid,
    searchQuery,
    pageSize = 25,
}: UseDashboardSchedulersParams) =>
    useInfiniteQuery<DashboardSchedulersResponse, ApiError>({
        queryKey: [
            'dashboard_schedulers',
            dashboardUuid,
            searchQuery,
            pageSize,
        ],
        queryFn: ({ pageParam = 1 }) =>
            getDashboardSchedulers(
                dashboardUuid,
                { page: pageParam as number, pageSize },
                searchQuery,
            ),
        getNextPageParam: (lastPage) => {
            const currentPage = lastPage.pagination?.page ?? 1;
            const totalPages = lastPage.pagination?.totalPageCount ?? 0;
            return currentPage < totalPages ? currentPage + 1 : undefined;
        },
        keepPreviousData: true,
        refetchOnWindowFocus: false,
        enabled: !!dashboardUuid,
    });

const createDashboardScheduler = async (
    uuid: string,
    data: CreateSchedulerAndTargetsWithoutIds,
) =>
    lightdashApi<ApiCreateDashboardSchedulerResponse['results']>({
        url: `/dashboards/${uuid}/schedulers`,
        method: 'POST',
        body: JSON.stringify(data),
    });

export const useDashboardSchedulerCreateMutation = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<
        ApiCreateDashboardSchedulerResponse['results'],
        ApiError,
        { resourceUuid: string; data: CreateSchedulerAndTargetsWithoutIds }
    >(
        ({ resourceUuid, data }) =>
            createDashboardScheduler(resourceUuid, data),
        {
            mutationKey: ['create_dashboard_scheduler'],
            onSuccess: async (_, variables) => {
                await queryClient.invalidateQueries([
                    'dashboard_schedulers',
                    variables.resourceUuid,
                ]);
                showToastSuccess({
                    title: `Success! Scheduled delivery was created.`,
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to create scheduled delivery`,
                    apiError: error,
                });
            },
        },
    );
};
