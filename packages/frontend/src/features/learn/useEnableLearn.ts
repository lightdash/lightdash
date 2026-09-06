import { type ApiError, type EnableLearnResults } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../api';

const enableLearn = async () =>
    lightdashApi<EnableLearnResults>({
        url: `/org/training-project`,
        method: 'POST',
        body: undefined,
    });

/**
 * Enable Learn for the organization (CS-257): creates the training project
 * with the caller as its admin. The project list and the user's abilities
 * change with it (the trainee layer applies once the project exists), so
 * both are refetched before the library renders.
 */
export const useEnableLearn = () => {
    const queryClient = useQueryClient();
    return useMutation<EnableLearnResults, ApiError>(enableLearn, {
        mutationKey: ['enable_learn'],
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries(['projects']),
                queryClient.invalidateQueries(['user']),
                queryClient.invalidateQueries(['account']),
            ]);
        },
    });
};
