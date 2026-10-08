import { type ApiError } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteTrainingPreviews } from '../scopeTours/trainingCopy';

/**
 * Start fresh: remove the learner's training copy, so the next walkthrough
 * begins from the seeded state. The project list and the learner's
 * abilities (the trainee layer on the copy) change with it, so both are
 * refetched.
 */
export const useStartFresh = () => {
    const queryClient = useQueryClient();
    return useMutation<undefined, ApiError, { trainingProjectUuid: string }>(
        ({ trainingProjectUuid }) =>
            deleteTrainingPreviews(trainingProjectUuid),
        {
            mutationKey: ['learn_start_fresh'],
            onSettled: async () => {
                await Promise.all([
                    queryClient.invalidateQueries(['projects']),
                    queryClient.invalidateQueries(['user']),
                    queryClient.invalidateQueries(['account']),
                ]);
            },
        },
    );
};
