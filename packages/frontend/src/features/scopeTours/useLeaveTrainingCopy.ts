import { type ApiError } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { readLearnOrigin } from '../learn/origin';
import { deleteTrainingPreviews, LEAVING_COPY_STATE } from './trainingCopy';

/**
 * Where a learner goes when their copy is put away: the project the library
 * was opened from, if it is still theirs, else the training project. Kept
 * as a function of an already-fetched project list so the callers that
 * have one do not fetch it again.
 */
export const learnReturnProjectUuid = (
    projects: { projectUuid: string }[] | undefined,
    upstreamProjectUuid: string | null,
): string | null => {
    const origin = readLearnOrigin();
    return origin &&
        projects?.some((candidate) => candidate.projectUuid === origin)
        ? origin
        : upstreamProjectUuid;
};

/**
 * Putting a training copy away. Shared by the completion dialog's Back to
 * library and the practice banner's Back to Learn, so the two cannot drift
 * apart on the ordering that matters: leave the copy first, and only remove
 * it once the learner's page has changed. The page being left is addressed
 * by the copy's slug and stays mounted until the next page has loaded; if
 * the project list refreshed first, that page would find its slug gone and
 * send the learner to the homepage, undoing the return.
 */
export const useLeaveTrainingCopy = () => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { mutate: closeCopy } = useMutation<
        undefined,
        ApiError,
        { trainingProjectUuid: string }
    >(
        ({ trainingProjectUuid }) =>
            deleteTrainingPreviews(trainingProjectUuid),
        {
            onSettled: async () => {
                await Promise.all([
                    queryClient.invalidateQueries(['projects']),
                    queryClient.invalidateQueries(['user']),
                    queryClient.invalidateQueries(['account']),
                ]);
            },
        },
    );

    return useCallback(
        async (to: string, trainingProjectUuid: string) => {
            await navigate(to, { state: LEAVING_COPY_STATE });
            closeCopy({ trainingProjectUuid });
        },
        [navigate, closeCopy],
    );
};
