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
import { type LightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

// Apps use a flat (non-paginated) list endpoint — schedule counts per app
// are expected to be small. We wrap the response in the same paginated
// shape the chart/dashboard hooks return so SchedulerModal can consume it
// uniformly via useInfiniteQuery.
type AppSchedulersPage = KnexPaginatedData<SchedulerAndTargets[]>;

const getAppSchedulers = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    appUuid: string,
    includeLatestRun?: boolean,
): Promise<AppSchedulersPage> => {
    const params = new URLSearchParams();

    if (includeLatestRun) {
        params.set('includeLatestRun', 'true');
    }

    const queryString = params.toString();
    const results = await lightdashApi<ApiAppSchedulersResponse['results']>({
        url: `/ee/projects/${projectUuid}/apps/${appUuid}/schedulers${
            queryString ? `?${queryString}` : ''
        }`,
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
    includeLatestRun?: boolean;
};

export const useAppSchedulers = ({
    projectUuid,
    appUuid,
    includeLatestRun,
}: UseAppSchedulersParams) => {
    const lightdashApi = useLightdashApi();
    return useInfiniteQuery<AppSchedulersPage, ApiError>({
        queryKey: ['app_schedulers', appUuid, includeLatestRun],
        queryFn: () =>
            getAppSchedulers(
                lightdashApi,
                projectUuid,
                appUuid,
                includeLatestRun,
            ),
        getNextPageParam: () => undefined, // single-page wrapper
        keepPreviousData: true,
        refetchOnWindowFocus: false,
        enabled: !!appUuid && !!projectUuid,
    });
};

const createAppScheduler = (
    lightdashApi: LightdashApi,
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
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<
        SchedulerAndTargets,
        ApiError,
        { resourceUuid: string; data: CreateSchedulerAndTargetsWithoutIds }
    >(
        ({ resourceUuid, data }) =>
            createAppScheduler(lightdashApi, projectUuid, resourceUuid, data),
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
