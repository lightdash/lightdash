import {
    isAgentOnboardingRunTerminal,
    type AgentOnboardingFile,
    type AgentOnboardingFileContent,
    type AgentOnboardingRun,
    type ApiAgentOnboardingActiveRunResponse,
    type ApiAgentOnboardingFileResponse,
    type ApiAgentOnboardingRunResponse,
    type ApiError,
} from '@lightdash/common';
import {
    useMutation,
    useQueries,
    useQuery,
    useQueryClient,
    type Query,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { type LightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';
import { useLightdashApi } from '../../../../providers/LightdashApi/useLightdashApi';
import { isSemanticLayerModelFile, parseSemanticLayerModel } from '../utils';

const POLL_INTERVAL_MS = 2_000;

const agentOnboardingRunQueryKey = (
    projectUuid: string | undefined,
    runUuid: string | undefined,
) => ['agent-onboarding-run', projectUuid, runUuid] as const;

const agentOnboardingActiveRunQueryKey = (projectUuid: string | undefined) =>
    ['agent-onboarding-active-run', projectUuid] as const;

const isRunGoneError = (error: ApiError | null) =>
    error !== null && [403, 404].includes(error.error.statusCode);

export const getAgentOnboardingRefetchInterval = (
    run: AgentOnboardingRun | undefined,
    query: Query<AgentOnboardingRun, ApiError>,
): number | false =>
    !isRunGoneError(query.state.error) &&
    (!run || !isAgentOnboardingRunTerminal(run.status))
        ? POLL_INTERVAL_MS
        : false;

const getRun = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    runUuid: string,
) =>
    lightdashApi<ApiAgentOnboardingRunResponse['results']>({
        url: `/ee/projects/${projectUuid}/agent-onboarding/${runUuid}`,
        method: 'GET',
        body: undefined,
    });

const getActiveRun = async (lightdashApi: LightdashApi, projectUuid: string) =>
    lightdashApi<ApiAgentOnboardingActiveRunResponse['results']>({
        url: `/ee/projects/${projectUuid}/agent-onboarding`,
        method: 'GET',
        body: undefined,
    });

const startRun = async (lightdashApi: LightdashApi, projectUuid: string) =>
    lightdashApi<ApiAgentOnboardingRunResponse['results']>({
        url: `/ee/projects/${projectUuid}/agent-onboarding`,
        method: 'POST',
        body: undefined,
    });

const cancelRun = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    runUuid: string,
) =>
    lightdashApi<ApiAgentOnboardingRunResponse['results']>({
        url: `/ee/projects/${projectUuid}/agent-onboarding/${runUuid}/cancel`,
        method: 'POST',
        body: undefined,
    });

const getFile = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    runUuid: string,
    path: string,
) =>
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
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<AgentOnboardingRun, ApiError>({
        queryKey: agentOnboardingRunQueryKey(projectUuid, runUuid),
        queryFn: () => getRun(lightdashApi, projectUuid!, runUuid!),
        enabled: !!projectUuid && !!runUuid && (options?.enabled ?? true),
        refetchInterval: getAgentOnboardingRefetchInterval,
    });
};

export const useActiveAgentOnboardingRun = (
    projectUuid: string | undefined,
    options?: Pick<
        UseQueryOptions<AgentOnboardingRun | null, ApiError>,
        'enabled' | 'refetchInterval'
    >,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<AgentOnboardingRun | null, ApiError>({
        queryKey: agentOnboardingActiveRunQueryKey(projectUuid),
        queryFn: () => getActiveRun(lightdashApi, projectUuid!),
        enabled: !!projectUuid && (options?.enabled ?? true),
        refetchInterval: options?.refetchInterval,
        // A run can start or finish elsewhere in the app, so this must not be
        // served stale on remount (e.g. after a back navigation)
        staleTime: 0,
    });
};

export const useAgentOnboardingFile = (
    projectUuid: string | undefined,
    runUuid: string | undefined,
    file: AgentOnboardingFile | undefined,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<AgentOnboardingFileContent, ApiError>({
        queryKey: [
            'agent-onboarding-file',
            projectUuid,
            runUuid,
            file?.path,
            file?.updatedAt,
        ],
        queryFn: () =>
            getFile(lightdashApi, projectUuid!, runUuid!, file!.path),
        enabled: !!projectUuid && !!runUuid && !!file,
        keepPreviousData: true,
    });
};

/** Several run files at once, sharing the single-file cache */
const useAgentOnboardingFiles = (
    projectUuid: string,
    runUuid: string,
    files: AgentOnboardingFile[],
) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    return useQueries({
        queries: files.map((file) => ({
            queryKey: [
                'agent-onboarding-file',
                projectUuid,
                runUuid,
                file.path,
                file.updatedAt,
            ],
            queryFn: () =>
                getFile(lightdashApi, projectUuid, runUuid, file.path),
            // Show the last version while a rewritten file loads
            placeholderData: () =>
                queryClient
                    .getQueriesData<AgentOnboardingFileContent>([
                        'agent-onboarding-file',
                        projectUuid,
                        runUuid,
                        file.path,
                    ])
                    .map(([, data]) => data)
                    .findLast((data) => data !== undefined),
        })),
    });
};

// Cached per fetched file object so polling re-renders don't re-parse YAML
const parsedModels = new WeakMap<
    AgentOnboardingFileContent,
    ReturnType<typeof parseSemanticLayerModel>
>();
const parseModelFile = (file: AgentOnboardingFileContent) => {
    const cached = parsedModels.get(file);
    if (cached !== undefined) return cached;
    const model = parseSemanticLayerModel(file.path, file.content);
    parsedModels.set(file, model);
    return model;
};

/** The model files a run wrote, with their content and what they define */
export const useRunSemanticLayer = (run: AgentOnboardingRun) => {
    const files = run.files.filter(isSemanticLayerModelFile);
    const queries = useAgentOnboardingFiles(
        run.projectUuid,
        run.agentOnboardingRunUuid,
        files,
    );
    const contents = queries.map(({ data }) =>
        data?.encoding === 'utf8' ? data.content : null,
    );
    const models = queries.map(({ data }) =>
        data?.encoding === 'utf8' ? parseModelFile(data) : null,
    );
    const count = (pick: 'metrics' | 'dimensions') =>
        models.reduce((sum, model) => sum + (model?.[pick].length ?? 0), 0);
    return {
        files,
        contents,
        models,
        metricCount: count('metrics'),
        dimensionCount: count('dimensions'),
    };
};

export const useStartAgentOnboardingRun = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();

    return useMutation<AgentOnboardingRun, ApiError, string>({
        mutationFn: (projectUuid: string) =>
            startRun(lightdashApi, projectUuid),
        onSuccess: (run) => {
            queryClient.setQueryData(
                agentOnboardingRunQueryKey(
                    run.projectUuid,
                    run.agentOnboardingRunUuid,
                ),
                run,
            );
            queryClient.setQueryData(
                agentOnboardingActiveRunQueryKey(run.projectUuid),
                run,
            );
        },
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
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();

    return useMutation<AgentOnboardingRun, ApiError, CancelRunArgs>({
        mutationFn: ({ projectUuid, runUuid }) =>
            cancelRun(lightdashApi, projectUuid, runUuid),
        onSuccess: (run) => {
            queryClient.setQueryData(
                agentOnboardingRunQueryKey(
                    run.projectUuid,
                    run.agentOnboardingRunUuid,
                ),
                run,
            );
            // Cancelled runs are terminal, so nothing is active any more
            queryClient.setQueryData(
                agentOnboardingActiveRunQueryKey(run.projectUuid),
                null,
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
