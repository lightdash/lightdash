import {
    type ContentReviewContentType,
    type ContentReviewRequest,
} from '@lightdash/common';
import { useMemo } from 'react';
import {
    usePersonalSpace,
    useSpaceSummaries,
} from '../../../../hooks/useSpaces';
import { getSpaceTreeUuids } from '../utils';
import { useContentReviewAvailability } from './useContentReviewAvailability';
import { usePendingContentReviewRequest } from './useContentReviewRequests';

type ContentReviewEligibility = {
    isAvailable: boolean;
    isPersonalContent: boolean;
    pendingRequest: ContentReviewRequest | null;
    canRequest: boolean;
};

// Only content in the viewer's own personal space, or a space nested under
// it, can be submitted, and only once at a time
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
    const { data: spaces } = useSpaceSummaries(projectUuid, true, {
        enabled:
            !!personalSpace && !!spaceUuid && spaceUuid !== personalSpace.uuid,
    });
    const personalSpaceUuids = useMemo(
        () =>
            personalSpace
                ? getSpaceTreeUuids(spaces ?? [], [personalSpace.uuid])
                : new Set<string>(),
        [personalSpace, spaces],
    );
    const isPersonalContent = !!spaceUuid && personalSpaceUuids.has(spaceUuid);
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
