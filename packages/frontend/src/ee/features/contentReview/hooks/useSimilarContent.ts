import {
    type ApiError,
    type ContentReviewContentType,
    type ContentReviewSimilarContentItem,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { getSimilarContentForReview } from '../api';

export const useSimilarContent = (
    projectUuid: string,
    params: {
        contentType: ContentReviewContentType;
        name: string;
        excludeContentUuid: string;
    },
    enabled: boolean,
) =>
    useQuery<ContentReviewSimilarContentItem[], ApiError>({
        queryKey: ['content-review', projectUuid, 'similar', params],
        queryFn: () => getSimilarContentForReview(projectUuid, params),
        enabled: enabled && params.name.trim().length > 0,
        staleTime: 60 * 1000,
    });
