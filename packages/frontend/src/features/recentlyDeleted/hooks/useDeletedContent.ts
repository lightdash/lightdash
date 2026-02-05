import {
    type ApiError,
    type ContentType,
    type DeletedContentItem,
    type DeletedContentSummary,
    type KnexPaginatedData,
} from '@lightdash/common';
import {
    useInfiniteQuery,
    useMutation,
    useQueryClient,
} from '@tanstack/react-query';
import useToaster from '../../../hooks/toaster/useToaster';
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
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation<undefined, ApiError, DeletedContentItem>({
        mutationFn: (item) => restoreDeletedContent(projectUuid, item),
        onSuccess: () => {
            showToastSuccess({
                title: 'Content restored',
                subtitle: 'The item has been restored successfully.',
            });
            void queryClient.invalidateQueries({
                queryKey: ['deletedContent'],
            });
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
        onSuccess: () => {
            showToastSuccess({
                title: 'Content permanently deleted',
                subtitle: 'The item has been permanently deleted.',
            });
            void queryClient.invalidateQueries({
                queryKey: ['deletedContent'],
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to delete content',
                apiError: error,
            });
        },
    });
}
