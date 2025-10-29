import {
    type ApiError,
    type ApiProjectCompileLogsResponse,
    type KnexPaginateArgs,
    type ProjectCompileLog,
} from '@lightdash/common';
import {
    useInfiniteQuery,
    type UseInfiniteQueryResult,
} from '@tanstack/react-query';
import { lightdashApi } from '../api';

export type { ProjectCompileLog };

const getProjectCompileLogs = async (
    projectUuid: string,
    paginateArgs: KnexPaginateArgs,
    sortBy?: 'created_at',
    sortDirection?: 'asc' | 'desc',
    source?: 'cli_deploy' | 'refresh_dbt' | 'create_project',
): Promise<ApiProjectCompileLogsResponse['results']> => {
    const params = new URLSearchParams({
        page: paginateArgs.page.toString(),
        pageSize: paginateArgs.pageSize.toString(),
    });

    if (sortBy) {
        params.append('sortBy', sortBy);
    }
    if (sortDirection) {
        params.append('sortDirection', sortDirection);
    }
    if (source) {
        params.append('source', source);
    }

    return lightdashApi<ApiProjectCompileLogsResponse['results']>({
        url: `/projects/${projectUuid}/compile-logs?${params.toString()}`,
        method: 'GET',
        body: undefined,
    });
};

export const useProjectCompileLogs = ({
    projectUuid,
    paginateArgs,
    sortBy,
    sortDirection,
    source,
}: {
    projectUuid: string;
    paginateArgs?: KnexPaginateArgs;
    sortBy?: 'created_at';
    sortDirection?: 'asc' | 'desc';
    source?: 'cli_deploy' | 'refresh_dbt' | 'create_project';
}): UseInfiniteQueryResult<
    ApiProjectCompileLogsResponse['results'],
    ApiError
> => {
    return useInfiniteQuery<ApiProjectCompileLogsResponse['results'], ApiError>(
        {
            queryKey: [
                'projectCompileLogs',
                projectUuid,
                paginateArgs,
                sortBy,
                sortDirection,
                source,
            ],
            queryFn: async ({ pageParam = 0 }) => {
                return getProjectCompileLogs(
                    projectUuid,
                    {
                        page: (pageParam as number) + 1,
                        pageSize: paginateArgs?.pageSize || 25,
                    },
                    sortBy,
                    sortDirection,
                    source,
                );
            },
            getNextPageParam: (_lastGroup, groups) => {
                const currentPage = groups.length - 1;
                const totalPages = _lastGroup.pagination?.totalPageCount ?? 0;
                return currentPage < totalPages - 1
                    ? currentPage + 1
                    : undefined;
            },
            keepPreviousData: true,
            refetchOnWindowFocus: false,
            enabled: !!projectUuid,
        },
    );
};
