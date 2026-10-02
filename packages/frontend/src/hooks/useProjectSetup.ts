import {
    ProjectSetupStepName,
    type ProjectSetupStepStatus,
    type ApiError,
    type ProjectSetupState,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../api';

const SETUP_POLL_MS = 3000;

const getProjectSetup = (projectUuid: string) =>
    lightdashApi<ProjectSetupState | null>({
        url: `/projects/${projectUuid}/setup`,
        method: 'GET',
        body: undefined,
    });

export const useProjectSetup = (
    projectUuid: string | undefined,
    { enabled, poll }: { enabled: boolean; poll: boolean },
) =>
    useQuery<ProjectSetupState | null, ApiError>({
        queryKey: ['project_setup', projectUuid],
        queryFn: () => getProjectSetup(projectUuid ?? ''),
        enabled: enabled && !!projectUuid,
        retry: false,
        refetchInterval: (data) =>
            poll && data?.finish === null ? SETUP_POLL_MS : false,
    });

export const useSkipSemanticLayer = (projectUuid: string) => {
    const queryClient = useQueryClient();
    return useMutation<ProjectSetupState, ApiError>({
        mutationFn: () =>
            lightdashApi<ProjectSetupState>({
                url: `/projects/${projectUuid}/setup/semantic-layer/skip`,
                method: 'POST',
                body: undefined,
            }),
        onSuccess: (state) => {
            queryClient.setQueryData(['project_setup', projectUuid], state);
        },
    });
};

export const getSemanticLayerStatus = (
    setup: ProjectSetupState | null | undefined,
): ProjectSetupStepStatus | null =>
    setup?.steps.find(
        ({ step }) => step === ProjectSetupStepName.SEMANTIC_LAYER,
    )?.status ?? null;
