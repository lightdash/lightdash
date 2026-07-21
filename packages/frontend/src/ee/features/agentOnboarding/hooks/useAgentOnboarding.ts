import {
    isAgentOnboardingRunTerminal,
    type AgentOnboardingFile,
    type AgentOnboardingFileContent,
    type AgentOnboardingRun,
    type ApiAgentOnboardingFileResponse,
    type ApiAgentOnboardingRunResponse,
    type ApiError,
} from '@lightdash/common';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';

const POLL_INTERVAL_MS = 2_000;

const agentOnboardingRunQueryKey = (
    projectUuid: string | undefined,
    runUuid: string | undefined,
) => ['agent-onboarding-run', projectUuid, runUuid] as const;

const getAgentOnboardingRefetchInterval = (
    run: AgentOnboardingRun | undefined,
): number | false =>
    !run || !isAgentOnboardingRunTerminal(run.status)
        ? POLL_INTERVAL_MS
        : false;

const getRun = async (projectUuid: string, runUuid: string) =>
    lightdashApi<ApiAgentOnboardingRunResponse['results']>({
        url: `/ee/projects/${projectUuid}/agent-onboarding/${runUuid}`,
        method: 'GET',
        body: undefined,
    });

const startRun = async (projectUuid: string) =>
    lightdashApi<ApiAgentOnboardingRunResponse['results']>({
        url: `/ee/projects/${projectUuid}/agent-onboarding`,
        method: 'POST',
        body: undefined,
    });

const cancelRun = async (projectUuid: string, runUuid: string) =>
    lightdashApi<ApiAgentOnboardingRunResponse['results']>({
        url: `/ee/projects/${projectUuid}/agent-onboarding/${runUuid}/cancel`,
        method: 'POST',
        body: undefined,
    });

const getFile = async (projectUuid: string, runUuid: string, path: string) =>
    lightdashApi<ApiAgentOnboardingFileResponse['results']>({
        url: `/ee/projects/${projectUuid}/agent-onboarding/${runUuid}/file?${new URLSearchParams(
            { path },
        ).toString()}`,
        method: 'GET',
        body: undefined,
    });

export const useAgentOnboardingRun = (
    projectUuid: string | undefined,
    runUuid: string | undefined,
    options?: Pick<UseQueryOptions<AgentOnboardingRun, ApiError>, 'enabled'>,
) =>
    useQuery<AgentOnboardingRun, ApiError>({
        queryKey: agentOnboardingRunQueryKey(projectUuid, runUuid),
        queryFn: () => getRun(projectUuid!, runUuid!),
        enabled: !!projectUuid && !!runUuid && (options?.enabled ?? true),
        refetchInterval: getAgentOnboardingRefetchInterval,
        refetchIntervalInBackground: true,
    });

export const useAgentOnboardingFile = (
    projectUuid: string | undefined,
    runUuid: string | undefined,
    file: AgentOnboardingFile | undefined,
) =>
    useQuery<AgentOnboardingFileContent, ApiError>({
        queryKey: [
            'agent-onboarding-file',
            projectUuid,
            runUuid,
            file?.path,
            file?.updatedAt,
        ],
        queryFn: () => getFile(projectUuid!, runUuid!, file!.path),
        enabled: !!projectUuid && !!runUuid && !!file,
    });

export const useStartAgentOnboardingRun = () => {
    const { showToastApiError } = useToaster();

    return useMutation<AgentOnboardingRun, ApiError, string>({
        mutationFn: startRun,
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to start project setup',
                apiError: error,
            });
        },
    });
};

type CancelRunArgs = {
    projectUuid: string;
    runUuid: string;
};

export const useCancelAgentOnboardingRun = () => {
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();

    return useMutation<AgentOnboardingRun, ApiError, CancelRunArgs>({
        mutationFn: ({ projectUuid, runUuid }) =>
            cancelRun(projectUuid, runUuid),
        onSuccess: (run) => {
            queryClient.setQueryData(
                agentOnboardingRunQueryKey(
                    run.projectUuid,
                    run.agentOnboardingRunUuid,
                ),
                run,
            );
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to cancel project setup',
                apiError: error,
            });
        },
    });
};
