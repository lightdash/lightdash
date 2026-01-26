import {
    type ApiCreateSavedChartSchedulerResponse,
    type ApiError,
    type ApiSavedChartPaginatedSchedulersResponse,
    type CreateSchedulerAndTargetsWithoutIds,
    type KnexPaginateArgs,
    type SchedulerFormat,
} from '@lightdash/common';
import {
    useInfiniteQuery,
    useMutation,
    useQueryClient,
} from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

type ChartSchedulersResponse =
    ApiSavedChartPaginatedSchedulersResponse['results'];

const getChartSchedulers = async (
    uuid: string,
    paginateArgs: KnexPaginateArgs,
    searchQuery?: string,
    formats?: SchedulerFormat[],
) => {
    const params = new URLSearchParams({
        page: paginateArgs.page.toString(),
        pageSize: paginateArgs.pageSize.toString(),
    });

    if (searchQuery) {
        params.set('searchQuery', searchQuery);
    }

    if (formats && formats.length > 0) {
        params.set('formats', formats.join(','));
    }

    return lightdashApi<ChartSchedulersResponse>({
        url: `/saved/${uuid}/schedulers?${params.toString()}`,
        method: 'GET',
        body: undefined,
        version: 'v2',
    });
};

export type UseChartSchedulersParams = {
    chartUuid: string;
    searchQuery?: string;
    pageSize?: number;
    formats?: SchedulerFormat[];
};

export const useChartSchedulers = ({
    chartUuid,
    searchQuery,
    pageSize = 25,
    formats,
}: UseChartSchedulersParams) =>
    useInfiniteQuery<ChartSchedulersResponse, ApiError>({
        queryKey: [
            'chart_schedulers',
            chartUuid,
            searchQuery,
            pageSize,
            formats,
        ],
        queryFn: ({ pageParam = 1 }) =>
            getChartSchedulers(
                chartUuid,
                { page: pageParam as number, pageSize },
                searchQuery,
                formats,
            ),
        getNextPageParam: (lastPage) => {
            const currentPage = lastPage.pagination?.page ?? 1;
            const totalPages = lastPage.pagination?.totalPageCount ?? 0;
            return currentPage < totalPages ? currentPage + 1 : undefined;
        },
        keepPreviousData: true,
        refetchOnWindowFocus: false,
        enabled: !!chartUuid,
    });

const createChartScheduler = async (
    uuid: string,
    data: CreateSchedulerAndTargetsWithoutIds,
) =>
    lightdashApi<ApiCreateSavedChartSchedulerResponse['results']>({
        url: `/saved/${uuid}/schedulers`,
        method: 'POST',
        body: JSON.stringify(data),
    });

export const useChartSchedulerCreateMutation = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<
        ApiCreateSavedChartSchedulerResponse['results'],
        ApiError,
        { resourceUuid: string; data: CreateSchedulerAndTargetsWithoutIds }
    >(({ resourceUuid, data }) => createChartScheduler(resourceUuid, data), {
        mutationKey: ['create_chart_scheduler'],
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries([
                'chart_schedulers',
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
    });
};
