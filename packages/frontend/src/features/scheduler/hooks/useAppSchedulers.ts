import {
    type ApiAppSchedulersResponse,
    type ApiCreateAppSchedulerResponse,
    type ApiError,
    type CreateSchedulerAndTargetsWithoutIds,
    type KnexPaginatedData,
    type SchedulerAndTargets,
} from '@lightdash/common';
import {
    useInfiniteQuery,
    useMutation,
    useQueryClient,
} from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

// Apps use a flat (non-paginated) list endpoint — schedule counts per app
// are expected to be small. We wrap the response in the same paginated
// shape the chart/dashboard hooks return so SchedulerModal can consume it
// uniformly via useInfiniteQuery.
type AppSchedulersPage = KnexPaginatedData<SchedulerAndTargets[]>;

const getAppSchedulers = async (
    projectUuid: string,
    appUuid: string,
): Promise<AppSchedulersPage> => {
    const results = await lightdashApi<ApiAppSchedulersResponse['results']>({
        url: `/ee/projects/${projectUuid}/apps/${appUuid}/schedulers`,
        method: 'GET',
        body: undefined,
    });
    return {
        data: results,
        pagination: {
            page: 1,
            pageSize: results.length || 1,
            totalPageCount: 1,
            totalResults: results.length,
        },
    };
};

export type UseAppSchedulersParams = {
    projectUuid: string;
    appUuid: string;
};

export const useAppSchedulers = ({
    projectUuid,
    appUuid,
}: UseAppSchedulersParams) =>
    useInfiniteQuery<AppSchedulersPage, ApiError>({
        queryKey: ['app_schedulers', appUuid],
        queryFn: () => getAppSchedulers(projectUuid, appUuid),
        getNextPageParam: () => undefined, // single-page wrapper
        keepPreviousData: true,
        refetchOnWindowFocus: false,
        enabled: !!appUuid && !!projectUuid,
    });

const createAppScheduler = (
    projectUuid: string,
    appUuid: string,
    data: CreateSchedulerAndTargetsWithoutIds,
) =>
    lightdashApi<ApiCreateAppSchedulerResponse['results']>({
        url: `/ee/projects/${projectUuid}/apps/${appUuid}/schedulers`,
        method: 'POST',
        body: JSON.stringify(data),
    });

export const useAppSchedulerCreateMutation = (projectUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<
        SchedulerAndTargets,
        ApiError,
        { resourceUuid: string; data: CreateSchedulerAndTargetsWithoutIds }
    >(
        ({ resourceUuid, data }) =>
            createAppScheduler(projectUuid, resourceUuid, data),
        {
            mutationKey: ['create_app_scheduler'],
            onSuccess: async (_, variables) => {
                await queryClient.invalidateQueries([
                    'app_schedulers',
                    variables.resourceUuid,
                ]);
                showToastSuccess({
                    title: 'Success! Scheduled delivery was created.',
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to create scheduled delivery',
                    apiError: error,
                });
            },
        },
    );
};
