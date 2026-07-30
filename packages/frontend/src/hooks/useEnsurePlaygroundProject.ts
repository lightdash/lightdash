import {
    type ApiError,
    type EnsurePlaygroundProjectResults,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../api';
import { refetchFeatureFlags } from './useServerOrClientFeatureFlag';

const ensurePlaygroundProjectQuery = async () =>
    lightdashApi<EnsurePlaygroundProjectResults>({
        url: `/org/playground-projects/ensure`,
        method: 'POST',
        body: undefined,
    });

export const useEnsurePlaygroundProject = () => {
    const queryClient = useQueryClient();
    return useMutation<EnsurePlaygroundProjectResults, ApiError>(
        ensurePlaygroundProjectQuery,
        {
            mutationKey: ['ensure_playground_project'],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['organization']);
                await queryClient.invalidateQueries(['projects']);
                // Provisioning the first project enables the org's onboarding
                // flags server-side.
                await refetchFeatureFlags(queryClient);
            },
        },
    );
};
