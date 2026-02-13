import {
    ContentType,
    type ApiError,
    type DeletedContentItem,
    type DeletedContentSummary,
    type KnexPaginatedData,
} from '@lightdash/common';
import { IconArrowRight } from '@tabler/icons-react';
import {
    useInfiniteQuery,
    useMutation,
    useQueryClient,
} from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import useToaster from '../../../hooks/toaster/useToaster';
import { invalidateContent } from '../../../hooks/useContent';
import {
    getDeletedContent,
    permanentlyDeleteContent,
    restoreDeletedContent,
} from '../api/deletedContent';

const DEFAULT_PAGE_SIZE = 50;

type UseInfiniteDeletedContentParams = {
    projectUuids: string[];
    pageSize?: number;
    search?: string;
    contentTypes?: ContentType[];
    deletedByUserUuids?: string[];
};

export function useInfiniteDeletedContent(
    params: UseInfiniteDeletedContentParams,
) {
    return useInfiniteQuery<
        KnexPaginatedData<DeletedContentSummary[]>,
        ApiError
    >({
        queryKey: [
            'deletedContent',
            params.projectUuids,
            params.pageSize,
            params.search,
            params.contentTypes,
            params.deletedByUserUuids,
        ],
        queryFn: async ({ pageParam = 1 }) => {
            return getDeletedContent({
                projectUuids: params.projectUuids,
                page: pageParam as number,
                pageSize: params.pageSize ?? DEFAULT_PAGE_SIZE,
                search: params.search,
                contentTypes: params.contentTypes,
                deletedByUserUuids: params.deletedByUserUuids,
            });
        },
        getNextPageParam: (_lastGroup, groups) => {
            const currentPage = groups.length;
            const totalPages = _lastGroup.pagination?.totalPageCount ?? 0;
            return currentPage < totalPages ? currentPage + 1 : undefined;
        },
        keepPreviousData: true,
        refetchOnWindowFocus: false,
    });
}

export function useRestoreDeletedContent(projectUuid: string) {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation<undefined, ApiError, DeletedContentItem>({
        mutationFn: (item) => restoreDeletedContent(projectUuid, item),
        onSuccess: async (_data, item) => {
            showToastSuccess({
                title: 'Content restored',
                subtitle: 'The item has been restored successfully.',
                action:
                    item.contentType === ContentType.CHART
                        ? {
                              children: 'Go to chart',
                              icon: IconArrowRight,
                              onClick: () =>
                                  navigate(
                                      `/projects/${projectUuid}/saved/${item.uuid}`,
                                  ),
                          }
                        : item.contentType === ContentType.DASHBOARD
                          ? {
                                children: 'Go to dashboard',
                                icon: IconArrowRight,
                                onClick: () =>
                                    navigate(
                                        `/projects/${projectUuid}/dashboards/${item.uuid}`,
                                    ),
                            }
                          : item.contentType === ContentType.SPACE
                            ? {
                                  children: 'Go to space',
                                  icon: IconArrowRight,
                                  onClick: () =>
                                      navigate(
                                          `/projects/${projectUuid}/spaces/${item.uuid}`,
                                      ),
                              }
                            : undefined,
            });
            await invalidateContent(queryClient, projectUuid);
            await queryClient.invalidateQueries(['deletedContent']);
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to restore content',
                apiError: error,
            });
        },
    });
}

export function usePermanentlyDeleteContent(projectUuid: string) {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation<undefined, ApiError, DeletedContentItem>({
        mutationFn: (item) => permanentlyDeleteContent(projectUuid, item),
        onSuccess: async () => {
            showToastSuccess({
                title: 'Content permanently deleted',
                subtitle: 'The item has been permanently deleted.',
            });
            await invalidateContent(queryClient, projectUuid);
            await queryClient.invalidateQueries(['deletedContent']);
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to delete content',
                apiError: error,
            });
        },
    });
}
