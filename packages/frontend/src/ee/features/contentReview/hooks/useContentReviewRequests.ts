import {
    type ApiError,
    type ApproveContentReviewRequestBody,
    type ContentReviewContentType,
    type ContentReviewRequest,
    type ContentReviewRequestDetail,
    type ContentReviewRequestListItem,
    ContentReviewRequestStatus,
    ContentReviewRequestView,
    type ContentReviewSettings,
    type CreateContentReviewRequestBody,
    type KnexPaginatedData,
    type RejectContentReviewRequestBody,
    type UpdateContentReviewSettings,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import useToaster from '../../../../hooks/toaster/useToaster';
import {
    approveContentReviewRequest,
    cancelContentReviewRequest,
    createContentReviewRequest,
    getContentReviewRequest,
    getContentReviewSettings,
    getPendingContentReviewRequest,
    listContentReviewRequests,
    rejectContentReviewRequest,
    updateContentReviewSettings,
} from '../api';

const CONTENT_REVIEW_QUERY_KEY = 'content-review';

export const usePendingContentReviewRequest = (
    projectUuid: string | undefined,
    contentType: ContentReviewContentType,
    contentUuid: string | undefined,
    enabled: boolean,
) =>
    useQuery<ContentReviewRequest | null, ApiError>({
        queryKey: [
            CONTENT_REVIEW_QUERY_KEY,
            projectUuid,
            'pending',
            contentType,
            contentUuid,
        ],
        queryFn: () =>
            getPendingContentReviewRequest(
                projectUuid!,
                contentType,
                contentUuid!,
            ),
        enabled: enabled && !!projectUuid && !!contentUuid,
        retry: (_, error) => error.error.statusCode !== 403,
    });

const useInvalidateContentReview = () => {
    const queryClient = useQueryClient();
    return async (projectUuid: string) => {
        await queryClient.invalidateQueries([
            CONTENT_REVIEW_QUERY_KEY,
            projectUuid,
        ]);
    };
};

export const useCreateContentReviewRequest = (projectUuid: string) => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const invalidate = useInvalidateContentReview();
    return useMutation<
        ContentReviewRequestDetail,
        ApiError,
        CreateContentReviewRequestBody
    >((body) => createContentReviewRequest(projectUuid, body), {
        mutationKey: ['content-review-request-create'],
        onSuccess: async (detail) => {
            await invalidate(projectUuid);
            showToastSuccess({
                title: 'Review requested',
                subtitle: detail.targetSpaceName
                    ? `Reviewers for ${detail.targetSpaceName} have been notified`
                    : undefined,
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to request a review',
                apiError: error,
            });
        },
    });
};

export const useCancelContentReviewRequest = (projectUuid: string) => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const invalidate = useInvalidateContentReview();
    return useMutation<ContentReviewRequestDetail, ApiError, string>(
        (requestUuid) => cancelContentReviewRequest(projectUuid, requestUuid),
        {
            mutationKey: ['content-review-request-cancel'],
            onSuccess: async () => {
                await invalidate(projectUuid);
                showToastSuccess({ title: 'Review request cancelled' });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to cancel the review request',
                    apiError: error,
                });
            },
        },
    );
};

export const useContentReviewRequests = (
    projectUuid: string,
    params: {
        view: ContentReviewRequestView;
        status: ContentReviewRequestStatus | null;
        page: number;
        pageSize: number;
    },
    enabled: boolean,
) =>
    useQuery<KnexPaginatedData<ContentReviewRequestListItem[]>, ApiError>({
        queryKey: [CONTENT_REVIEW_QUERY_KEY, projectUuid, 'list', params],
        queryFn: () => listContentReviewRequests(projectUuid, params),
        enabled,
        keepPreviousData: true,
    });

export const useContentReviewRequest = (
    projectUuid: string,
    requestUuid: string | undefined,
) =>
    useQuery<ContentReviewRequestDetail, ApiError>({
        queryKey: [
            CONTENT_REVIEW_QUERY_KEY,
            projectUuid,
            'request',
            requestUuid,
        ],
        queryFn: () => getContentReviewRequest(projectUuid, requestUuid!),
        enabled: !!requestUuid,
    });

export const useApproveContentReviewRequest = (projectUuid: string) => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const invalidate = useInvalidateContentReview();
    const queryClient = useQueryClient();
    return useMutation<
        ContentReviewRequestDetail,
        ApiError,
        { requestUuid: string; body: ApproveContentReviewRequestBody }
    >(
        ({ requestUuid, body }) =>
            approveContentReviewRequest(projectUuid, requestUuid, body),
        {
            mutationKey: ['content-review-request-approve'],
            onSuccess: async (detail) => {
                await invalidate(projectUuid);
                // The content moved, so space and content lists are stale
                await queryClient.invalidateQueries(['spaces']);
                await queryClient.invalidateQueries(['content']);
                await queryClient.invalidateQueries(['verified-content']);
                showToastSuccess({
                    title: detail.verifiedOnApprove
                        ? 'Request approved and content verified'
                        : 'Request approved',
                    subtitle: detail.targetSpaceName
                        ? `Moved to ${detail.targetSpaceName}`
                        : undefined,
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to approve the request',
                    apiError: error,
                });
            },
        },
    );
};

export const useRejectContentReviewRequest = (projectUuid: string) => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const invalidate = useInvalidateContentReview();
    return useMutation<
        ContentReviewRequestDetail,
        ApiError,
        { requestUuid: string; body: RejectContentReviewRequestBody }
    >(
        ({ requestUuid, body }) =>
            rejectContentReviewRequest(projectUuid, requestUuid, body),
        {
            mutationKey: ['content-review-request-reject'],
            onSuccess: async () => {
                await invalidate(projectUuid);
                showToastSuccess({ title: 'Request rejected' });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to reject the request',
                    apiError: error,
                });
            },
        },
    );
};

export const useContentReviewSettings = (
    projectUuid: string,
    enabled: boolean,
) =>
    useQuery<ContentReviewSettings, ApiError>({
        queryKey: [CONTENT_REVIEW_QUERY_KEY, projectUuid, 'settings'],
        queryFn: () => getContentReviewSettings(projectUuid),
        enabled,
    });

export const useUpdateContentReviewSettings = (projectUuid: string) => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const invalidate = useInvalidateContentReview();
    return useMutation<
        ContentReviewSettings,
        ApiError,
        UpdateContentReviewSettings
    >((body) => updateContentReviewSettings(projectUuid, body), {
        mutationKey: ['content-review-settings-update'],
        onSuccess: async () => {
            await invalidate(projectUuid);
            showToastSuccess({ title: 'Review settings saved' });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to save review settings',
                apiError: error,
            });
        },
    });
};

// Cheap count for nav badges: one row, read the pagination total
export const usePendingContentReviewCount = (
    projectUuid: string,
    enabled: boolean,
) =>
    useQuery<
        KnexPaginatedData<ContentReviewRequestListItem[]>,
        ApiError,
        number
    >({
        queryKey: [CONTENT_REVIEW_QUERY_KEY, projectUuid, 'pending-count'],
        queryFn: () =>
            listContentReviewRequests(projectUuid, {
                view: ContentReviewRequestView.TO_REVIEW,
                status: ContentReviewRequestStatus.PENDING,
                page: 1,
                pageSize: 1,
            }),
        select: (data) => data.pagination?.totalResults ?? 0,
        enabled,
        staleTime: 60_000,
    });
