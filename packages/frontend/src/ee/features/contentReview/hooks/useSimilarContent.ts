import {
    type ApiError,
    ContentReviewContentType,
    type FindSimilarContentBody,
    type ContentReviewSimilarContentItem,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useAmbientAiEnabled } from '../../ambientAi/hooks/useAmbientAiEnabled';
import { getSimilarContentForReview } from '../api';

export const useSimilarContent = (
    projectUuid: string,
    params: FindSimilarContentBody,
    enabled: boolean,
) => {
    const ambientAiEnabled = useAmbientAiEnabled();
    const isEnabled =
        enabled &&
        !!ambientAiEnabled &&
        params.contentType === ContentReviewContentType.CHART &&
        !!(params.chart || params.excludeContentUuid) &&
        params.name.trim().length > 0;
    const query = useQuery<ContentReviewSimilarContentItem[], ApiError>({
        queryKey: ['content-review', projectUuid, 'similar', params],
        queryFn: ({ signal }) =>
            getSimilarContentForReview(projectUuid, params, signal),
        refetchOnWindowFocus: false,
        retry: false,
        enabled: isEnabled,
        staleTime: 60 * 1000,
    });

    return {
        ...query,
        isEnabled,
        // A disabled query can still hold cached data. Hide it immediately when
        // AI is switched off, and do not retain suggestions after a failed check.
        data: isEnabled && !query.isError ? query.data : undefined,
        isInitialLoading: isEnabled && query.isInitialLoading,
    };
};
