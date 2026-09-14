import {
    type ContentReviewContentType,
    type ContentReviewRequest,
} from '@lightdash/common';
import { usePersonalSpace } from '../../../../hooks/useSpaces';
import { useContentReviewAvailability } from './useContentReviewAvailability';
import { usePendingContentReviewRequest } from './useContentReviewRequests';

type ContentReviewEligibility = {
    isAvailable: boolean;
    isPersonalContent: boolean;
    pendingRequest: ContentReviewRequest | null;
    canRequest: boolean;
};

// Only content in the viewer's own personal space can be submitted, and
// only once at a time
export const useContentReviewEligibility = ({
    projectUuid,
    contentType,
    contentUuid,
    spaceUuid,
}: {
    projectUuid: string | undefined;
    contentType: ContentReviewContentType;
    contentUuid: string | undefined;
    spaceUuid: string | null | undefined;
}): ContentReviewEligibility => {
    const { isAvailable } = useContentReviewAvailability();
    const { data: personalSpace } = usePersonalSpace(projectUuid, {
        enabled: isAvailable,
    });
    const isPersonalContent =
        !!personalSpace && !!spaceUuid && personalSpace.uuid === spaceUuid;
    const pending = usePendingContentReviewRequest(
        projectUuid,
        contentType,
        contentUuid,
        isAvailable && isPersonalContent,
    );
    return {
        isAvailable,
        isPersonalContent,
        pendingRequest: pending.data ?? null,
        canRequest:
            isAvailable &&
            isPersonalContent &&
            pending.isSuccess &&
            pending.data === null,
    };
};
