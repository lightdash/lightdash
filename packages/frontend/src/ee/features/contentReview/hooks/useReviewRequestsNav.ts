import { useContentReviewAvailability } from './useContentReviewAvailability';
import { usePendingContentReviewCount } from './useContentReviewRequests';

/** Whether the review queue is offered in navigation, and how many requests wait on the viewer. */
export const useReviewRequestsNav = (projectUuid: string | undefined) => {
    const { isAvailable } = useContentReviewAvailability();
    const { data: pendingCount = 0 } = usePendingContentReviewCount(
        projectUuid ?? '',
        isAvailable && projectUuid !== undefined,
    );
    return { isAvailable, pendingCount };
};
