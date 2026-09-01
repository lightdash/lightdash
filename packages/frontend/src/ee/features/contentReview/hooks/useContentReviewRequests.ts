import {
    type ApiError,
    type ContentReviewContentType,
    type ContentReviewRequest,
    type ContentReviewRequestDetail,
    type CreateContentReviewRequestBody,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import useToaster from '../../../../hooks/toaster/useToaster';
import {
    cancelContentReviewRequest,
    createContentReviewRequest,
    getPendingContentReviewRequest,
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
