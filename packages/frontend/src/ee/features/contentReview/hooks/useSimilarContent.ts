import {
    type ApiError,
    type FindSimilarContentBody,
    type ContentReviewSimilarContentItem,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { getSimilarContentForReview } from '../api';

export const useSimilarContent = (
    projectUuid: string,
    params: FindSimilarContentBody,
    enabled: boolean,
) =>
    useQuery<ContentReviewSimilarContentItem[], ApiError>({
        queryKey: ['content-review', projectUuid, 'similar', params],
        queryFn: ({ signal }) =>
            getSimilarContentForReview(projectUuid, params, signal),
        refetchOnWindowFocus: false,
        retry: false,
        enabled: enabled && params.name.trim().length > 0,
        staleTime: 60 * 1000,
    });
