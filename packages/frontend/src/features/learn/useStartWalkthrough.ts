import {
    type ApiError,
    type CreateTrainingPreviewResults,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router';
import useApp from '../../providers/App/useApp';
import { type LearnStartSource } from '../../providers/Tracking/types';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import { SCOPE_TOURS } from '../scopeTours/generated';
import {
    createTrainingPreview,
    tourUrlInCopy,
} from '../scopeTours/trainingCopy';
import { markScopeStarted, useLearnProgress } from './progress';

/**
 * Start a walkthrough the way the library does: make the learner's copy
 * here and go straight into it, so nothing of the shared training project
 * flashes past on the way. `from=learn` brings them back to the library
 * side (the completion page on Got it, the library on Skip) when it ends.
 * Shared by the library and the completion page so both start identically.
 */
export const useStartWalkthrough = (
    trainingProjectUuid: string | undefined,
) => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { user } = useApp();
    const { track } = useTracking();
    const { completed } = useLearnProgress();
    const [opening, setOpening] = useState<string | null>(null);
    const { mutate: openInCopy } = useMutation<
        CreateTrainingPreviewResults,
        ApiError,
        { scope: string }
    >(() => createTrainingPreview(trainingProjectUuid!), {
        onMutate: ({ scope }) => setOpening(scope),
        onError: () => setOpening(null),
        onSuccess: async (copy, { scope }) => {
            // The navbar resolves the active project from the cached project
            // list, and the trainee permissions on the new copy only exist
            // in a freshly built ability, so refresh both before moving there.
            await Promise.all([
                queryClient.invalidateQueries(['projects']),
                queryClient.invalidateQueries(['user']),
                queryClient.invalidateQueries(['account']),
            ]);
            void navigate(tourUrlInCopy(copy.projectUuid, scope, 'learn'));
        },
    });
    const start = useCallback(
        (scope: string, source: LearnStartSource) => {
            if (!trainingProjectUuid || opening || !SCOPE_TOURS[scope]) return;
            // Recorded together: the local progress the learner sees, and
            // the event that says who started what, and from where.
            markScopeStarted(scope);
            track({
                name: EventName.LEARN_WALKTHROUGH_STARTED,
                properties: {
                    organizationUuid: user.data?.organizationUuid ?? null,
                    trainingProjectUuid,
                    scope,
                    source,
                    isRestart: completed.includes(scope),
                },
            });
            openInCopy({ scope });
        },
        [
            trainingProjectUuid,
            opening,
            openInCopy,
            track,
            user.data?.organizationUuid,
            completed,
        ],
    );
    return { start, opening };
};
