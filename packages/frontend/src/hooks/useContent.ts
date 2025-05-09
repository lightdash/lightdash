import {
    type ApiContentActionBody,
    type ApiContentBulkActionBody,
    type ApiContentResponse,
    type ApiError,
    type ApiSuccessEmpty,
    type ContentSortByColumns,
    type ContentType,
} from '@lightdash/common';
import { IconArrowRight } from '@tabler/icons-react';
import {
    useInfiniteQuery,
    useMutation,
    useQueryClient,
    type UseInfiniteQueryOptions,
} from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { lightdashApi } from '../api';
import useToaster from './toaster/useToaster';

export type ContentArgs = {
    projectUuids: string[];
    spaceUuids?: string[];
    contentTypes?: ContentType[];
    pageSize?: number;
    page?: number;
    search?: string;
    sortBy?: ContentSortByColumns;
    sortDirection?: 'asc' | 'desc';
};

function createQueryString(params: Record<string, any>): string {
    const query = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
        if (Array.isArray(value)) {
            value.forEach((v) => query.append(key, v));
        } else if (value !== undefined) {
            query.append(key, value.toString());
        }
    }
    return query.toString();
}
const getContent = async (args: ContentArgs) => {
    const params = createQueryString(args);
    return lightdashApi<ApiContentResponse['results']>({
        version: 'v2',
        url: `/content?${params}`,
        method: 'GET',
        body: undefined,
    });
};

export const useInfiniteContent = (
    args: ContentArgs,
    infinityQueryOpts: UseInfiniteQueryOptions<
        ApiContentResponse['results'],
        ApiError
    > = {},
) => {
    return useInfiniteQuery<ApiContentResponse['results'], ApiError>({
        queryKey: ['content', args],
        queryFn: async ({ pageParam }) => {
            return getContent({
                ...args,
                page: pageParam ?? 1,
            });
        },
        getNextPageParam: (lastPage) => {
            if (lastPage.pagination) {
                return lastPage.pagination.page <
                    lastPage.pagination.totalPageCount
                    ? lastPage.pagination.page + 1
                    : undefined;
            }
        },
        ...infinityQueryOpts,
    });
};

const postContentAction = async ({
    projectUuid,
    body,
}: {
    projectUuid: string;
    body: ApiContentActionBody;
}) => {
    return lightdashApi<ApiSuccessEmpty>({
        version: 'v2',
        url: `/content/${projectUuid}/${body.action.type}`,
        method: 'POST',
        body: JSON.stringify(body),
    });
};

const postContentBulkAction = async ({
    projectUuid,
    body,
}: {
    projectUuid: string;
    body: ApiContentBulkActionBody;
}) => {
    return lightdashApi<ApiSuccessEmpty>({
        version: 'v2',
        url: `/content/bulk-action/${projectUuid}/${body.action.type}`,
        method: 'POST',
        body: JSON.stringify(body),
    });
};

export const useContentAction = (projectUuid: string) => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    return useMutation<ApiSuccessEmpty, ApiError, ApiContentActionBody>({
        mutationFn: (body) =>
            postContentAction({
                projectUuid,
                body,
            }),
        onSuccess: async (_data, { item, action }) => {
            await Promise.all([
                queryClient.invalidateQueries([
                    'projects',
                    projectUuid,
                    'spaces',
                ]),
                queryClient.invalidateQueries(['pinned_items']),
                queryClient.invalidateQueries(['content']),
                queryClient.invalidateQueries(['space', projectUuid]),
            ]);

            switch (action.type) {
                case 'move':
                    return showToastSuccess({
                        title: `Successfully moved ${item.contentType} to a space`,
                        action: {
                            children: 'Go to space',
                            icon: IconArrowRight,
                            onClick: () =>
                                navigate(
                                    action.targetSpaceUuid
                                        ? `/projects/${projectUuid}/spaces/${action.targetSpaceUuid}`
                                        : `/projects/${projectUuid}/spaces`,
                                ),
                        },
                    });

                case 'delete':
                    return showToastSuccess({
                        title: `Successfully deleted ${item.contentType}.`,
                    });
            }
        },
        onError: ({ error }) => {
            showToastApiError({
                title: `Failed to move content`,
                apiError: error,
            });
        },
    });
};

export const useContentBulkAction = (projectUuid: string) => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    return useMutation<ApiSuccessEmpty, ApiError, ApiContentBulkActionBody>({
        mutationFn: (body) =>
            postContentBulkAction({
                projectUuid,
                body,
            }),
        onSuccess: async (_data, { content, action }) => {
            await Promise.all([
                queryClient.invalidateQueries([
                    'projects',
                    projectUuid,
                    'spaces',
                ]),
                queryClient.invalidateQueries(['pinned_items']),
                queryClient.invalidateQueries(['content']),
                queryClient.invalidateQueries(['space', projectUuid]),
            ]);

            switch (action.type) {
                case 'move':
                    return showToastSuccess({
                        title: `Successfully moved ${content.length} ${
                            content.length === 1 ? 'item' : 'items'
                        } to a space`,
                        action: {
                            children: 'Go to space',
                            icon: IconArrowRight,
                            onClick: () =>
                                navigate(
                                    action.targetSpaceUuid
                                        ? `/projects/${projectUuid}/spaces/${action.targetSpaceUuid}`
                                        : `/projects/${projectUuid}/spaces`,
                                ),
                        },
                    });

                case 'delete':
                    return showToastSuccess({
                        title: `Successfully deleted ${content.length} ${
                            content.length === 1 ? 'item' : 'items'
                        }.`,
                    });
            }
        },
        onError: ({ error }) => {
            showToastApiError({
                title: `Failed to move content`,
                apiError: error,
            });
        },
    });
};
