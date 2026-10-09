import {
    type ApiError,
    type EnsurePlaygroundProjectRequest,
    type EnsurePlaygroundProjectResults,
    type PlaygroundProjectTrigger,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../api';
import { useLightdashApi } from '../providers/LightdashApi/useLightdashApi';
import { refetchFeatureFlags } from './useServerOrClientFeatureFlag';

type EnsurePlaygroundProjectVariables = {
    trigger: PlaygroundProjectTrigger;
};

const ensurePlaygroundProjectQuery = async (
    lightdashApi: LightdashApi,
    { trigger }: EnsurePlaygroundProjectVariables,
) =>
    lightdashApi<EnsurePlaygroundProjectResults>({
        url: `/org/playground-projects/ensure`,
        method: 'POST',
        body: JSON.stringify({
            trigger,
        } satisfies EnsurePlaygroundProjectRequest),
    });

export const useEnsurePlaygroundProject = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    return useMutation<
        EnsurePlaygroundProjectResults,
        ApiError,
        EnsurePlaygroundProjectVariables
    >(
        (args: EnsurePlaygroundProjectVariables) =>
            ensurePlaygroundProjectQuery(lightdashApi, args),
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
