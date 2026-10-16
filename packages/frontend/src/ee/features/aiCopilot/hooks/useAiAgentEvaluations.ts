import type {
    AiAgentEvaluationRunSummary,
    ApiAiAgentEvaluationResponse,
    ApiAiAgentEvaluationRunResponse,
    ApiAiAgentEvaluationRunResultsResponse,
    ApiAiAgentEvaluationRunSummaryListResponse,
    ApiAiAgentEvaluationSummaryListResponse,
    ApiAppendEvaluationRequest,
    ApiCreateEvaluationRequest,
    ApiCreateEvaluationResponse,
    ApiError,
    ApiSuccessEmpty,
    ApiUpdateEvaluationRequest,
} from '@lightdash/common';
import { IconArrowRight } from '@tabler/icons-react';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { lightdashApi } from '../../../../api';
import {
    getAiAccessRefusal,
    isAiAgentAuthorizationError,
} from '../../../../features/aiAccess/errors';
import useToaster from '../../../../hooks/toaster/useToaster';
import i18n from '../../../../i18n/i18n';

const AI_AGENT_EVALUATIONS_KEY = 'aiAgentEvaluations';
const AI_AGENT_EVALUATION_RUNS_KEY = 'aiAgentEvaluationRuns';
const POLLING_INTERVAL = 4000;

const getEvaluations = async (
    projectUuid: string,
    agentUuid: string,
): Promise<ApiAiAgentEvaluationSummaryListResponse['results']> => {
    return lightdashApi<ApiAiAgentEvaluationSummaryListResponse['results']>({
        version: 'v1',
        url: `/projects/${projectUuid}/aiAgents/${agentUuid}/evaluations`,
        method: 'GET',
        body: undefined,
    });
};

const getEvaluation = async (
    projectUuid: string,
    agentUuid: string,
    evalUuid: string,
): Promise<ApiAiAgentEvaluationResponse['results']> => {
    return lightdashApi<ApiAiAgentEvaluationResponse['results']>({
        version: 'v1',
        url: `/projects/${projectUuid}/aiAgents/${agentUuid}/evaluations/${evalUuid}`,
        method: 'GET',
        body: undefined,
    });
};

const getEvaluationRuns = async (
    projectUuid: string,
    agentUuid: string,
    evalUuid: string,
): Promise<ApiAiAgentEvaluationRunSummaryListResponse['results']> => {
    // TODO :: support pagination on clinet-side
    return lightdashApi<ApiAiAgentEvaluationRunSummaryListResponse['results']>({
        version: 'v1',
        url: `/projects/${projectUuid}/aiAgents/${agentUuid}/evaluations/${evalUuid}/runs`,
        method: 'GET',
        body: undefined,
    });
};

const getEvaluationRunResults = async (
    projectUuid: string,
    agentUuid: string,
    evalUuid: string,
    runUuid: string,
): Promise<ApiAiAgentEvaluationRunResultsResponse['results']> => {
    return lightdashApi<ApiAiAgentEvaluationRunResultsResponse['results']>({
        version: 'v1',
        url: `/projects/${projectUuid}/aiAgents/${agentUuid}/evaluations/${evalUuid}/runs/${runUuid}`,
        method: 'GET',
        body: undefined,
    });
};

// Common error handler for evaluation-related queries
const useEvaluationErrorHandler = (
    projectUuid: string | undefined,
    errorTitle: string,
) => {
    const navigate = useNavigate();
    const { showToastApiError } = useToaster();

    return useCallback(
        (error: ApiError) => {
            if (isAiAgentAuthorizationError(error.error)) {
                void navigate(
                    `/projects/${projectUuid}/ai-agents/not-authorized`,
                );
            } else if (!getAiAccessRefusal(error.error)) {
                showToastApiError({
                    title: errorTitle,
                    apiError: error.error,
                });
            }
        },
        [navigate, projectUuid, showToastApiError, errorTitle],
    );
};

export const useAiAgentEvaluations = (
    projectUuid: string | undefined,
    agentUuid: string | undefined,
    options?: UseQueryOptions<
        ApiAiAgentEvaluationSummaryListResponse['results'],
        ApiError
    >,
) => {
    const handleError = useEvaluationErrorHandler(
        projectUuid,
        i18n.t('toasts.evaluations.fetchListFailed', { ns: 'aiAgent' }),
    );

    return useQuery<
        ApiAiAgentEvaluationSummaryListResponse['results'],
        ApiError
    >({
        queryKey: [AI_AGENT_EVALUATIONS_KEY, projectUuid, agentUuid],
        queryFn: () => getEvaluations(projectUuid!, agentUuid!),
        onError: (error) => {
            handleError(error);
            options?.onError?.(error);
        },
        enabled: !!projectUuid && !!agentUuid && options?.enabled !== false,
        ...options,
    });
};

export const useAiAgentEvaluation = (
    projectUuid: string | undefined,
    agentUuid: string | undefined,
    evalUuid: string | undefined,
    options?: UseQueryOptions<
        ApiAiAgentEvaluationResponse['results'],
        ApiError
    >,
) => {
    const handleError = useEvaluationErrorHandler(
        projectUuid,
        i18n.t('toasts.evaluations.fetchFailed', { ns: 'aiAgent' }),
    );

    return useQuery<ApiAiAgentEvaluationResponse['results'], ApiError>({
        queryKey: [AI_AGENT_EVALUATIONS_KEY, projectUuid, agentUuid, evalUuid],
        queryFn: () => getEvaluation(projectUuid!, agentUuid!, evalUuid!),
        onError: (error) => {
            handleError(error);
            options?.onError?.(error);
        },
        enabled:
            !!projectUuid &&
            !!agentUuid &&
            !!evalUuid &&
            options?.enabled !== false,
        ...options,
    });
};

export const useAiAgentEvaluationRuns = (
    projectUuid: string | undefined,
    agentUuid: string | undefined,
    evalUuid: string | undefined,
    options?: UseQueryOptions<
        ApiAiAgentEvaluationRunSummaryListResponse['results'],
        ApiError
    >,
) => {
    const handleError = useEvaluationErrorHandler(
        projectUuid,
        i18n.t('toasts.evaluations.fetchRunsFailed', { ns: 'aiAgent' }),
    );

    return useQuery<
        ApiAiAgentEvaluationRunSummaryListResponse['results'],
        ApiError
    >({
        queryKey: [
            AI_AGENT_EVALUATION_RUNS_KEY,
            projectUuid,
            agentUuid,
            evalUuid,
        ],
        queryFn: () => getEvaluationRuns(projectUuid!, agentUuid!, evalUuid!),
        onError: (error) => {
            handleError(error);
            options?.onError?.(error);
        },
        enabled:
            !!projectUuid &&
            !!agentUuid &&
            !!evalUuid &&
            options?.enabled !== false,
        ...options,
    });
};

export const useAiAgentEvaluationRunResults = (
    projectUuid: string | undefined,
    agentUuid: string | undefined,
    evalUuid: string | undefined,
    runUuid: string | undefined,
    options?: UseQueryOptions<
        ApiAiAgentEvaluationRunResultsResponse['results'],
        ApiError
    >,
) => {
    const handleError = useEvaluationErrorHandler(
        projectUuid,
        i18n.t('toasts.evaluations.fetchRunResultsFailed', { ns: 'aiAgent' }),
    );

    return useQuery<
        ApiAiAgentEvaluationRunResultsResponse['results'],
        ApiError
    >({
        queryKey: [
            AI_AGENT_EVALUATION_RUNS_KEY,
            projectUuid,
            agentUuid,
            evalUuid,
            runUuid,
        ],
        queryFn: () =>
            getEvaluationRunResults(
                projectUuid!,
                agentUuid!,
                evalUuid!,
                runUuid!,
            ),
        onError: (error) => {
            handleError(error);
            options?.onError?.(error);
        },
        enabled:
            !!projectUuid &&
            !!agentUuid &&
            !!evalUuid &&
            !!runUuid &&
            options?.enabled !== false,
        ...options,
    });
};

const createEvaluation = async (
    projectUuid: string,
    agentUuid: string,
    data: ApiCreateEvaluationRequest,
): Promise<ApiCreateEvaluationResponse['results']> =>
    lightdashApi<ApiCreateEvaluationResponse['results']>({
        version: 'v1',
        url: `/projects/${projectUuid}/aiAgents/${agentUuid}/evaluations`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const runEvaluation = async (
    projectUuid: string,
    agentUuid: string,
    evalUuid: string,
): Promise<ApiAiAgentEvaluationRunResponse['results']> =>
    lightdashApi<ApiAiAgentEvaluationRunResponse['results']>({
        version: 'v1',
        url: `/projects/${projectUuid}/aiAgents/${agentUuid}/evaluations/${evalUuid}/run`,
        method: 'POST',
        body: undefined,
    });

const updateEvaluation = async (
    projectUuid: string,
    agentUuid: string,
    evalUuid: string,
    data: ApiUpdateEvaluationRequest,
): Promise<ApiAiAgentEvaluationResponse['results']> =>
    lightdashApi<ApiAiAgentEvaluationResponse['results']>({
        version: 'v1',
        url: `/projects/${projectUuid}/aiAgents/${agentUuid}/evaluations/${evalUuid}`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

const appendToEvaluation = async (
    projectUuid: string,
    agentUuid: string,
    evalUuid: string,
    data: ApiAppendEvaluationRequest,
): Promise<ApiAiAgentEvaluationResponse['results']> =>
    lightdashApi<ApiAiAgentEvaluationResponse['results']>({
        version: 'v1',
        url: `/projects/${projectUuid}/aiAgents/${agentUuid}/evaluations/${evalUuid}/append`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const deleteEvaluation = async (
    projectUuid: string,
    agentUuid: string,
    evalUuid: string,
): Promise<ApiSuccessEmpty['results']> =>
    lightdashApi<ApiSuccessEmpty['results']>({
        version: 'v1',
        url: `/projects/${projectUuid}/aiAgents/${agentUuid}/evaluations/${evalUuid}`,
        method: 'DELETE',
        body: undefined,
    });

export const useCreateEvaluation = (
    projectUuid: string | undefined,
    agentUuid: string | undefined,
    { showToastButton = false }: { showToastButton?: boolean } = {},
) => {
    const handleError = useEvaluationErrorHandler(
        projectUuid,
        i18n.t('toasts.evaluations.createFailed', { ns: 'aiAgent' }),
    );
    const { showToastSuccess } = useToaster();
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    return useMutation({
        mutationFn: (data: ApiCreateEvaluationRequest) =>
            createEvaluation(projectUuid!, agentUuid!, data),
        onSuccess: (result) => {
            showToastSuccess({
                title: i18n.t('toasts.evaluations.created', { ns: 'aiAgent' }),
                action: showToastButton
                    ? {
                          children: i18n.t(
                              'toasts.evaluations.goToEvaluation',
                              { ns: 'aiAgent' },
                          ),
                          icon: IconArrowRight,
                          onClick: () => {
                              void navigate(
                                  `/projects/${projectUuid}/ai-agents/${agentUuid}/edit/evals/${result.evalUuid}`,
                              );
                          },
                      }
                    : undefined,
            });
            void queryClient.invalidateQueries({
                queryKey: [AI_AGENT_EVALUATIONS_KEY, projectUuid, agentUuid],
            });
        },
        onError: handleError,
    });
};

export const useRunEvaluation = (
    projectUuid: string | undefined,
    agentUuid: string | undefined,
) => {
    const handleError = useEvaluationErrorHandler(
        projectUuid,
        i18n.t('toasts.evaluations.runFailed', { ns: 'aiAgent' }),
    );
    const { showToastSuccess } = useToaster();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (evalUuid: string) =>
            runEvaluation(projectUuid!, agentUuid!, evalUuid),
        onSuccess: (_, evalUuid) => {
            showToastSuccess({
                title: i18n.t('toasts.evaluations.runStarted', {
                    ns: 'aiAgent',
                }),
            });
            void queryClient.invalidateQueries({
                queryKey: [
                    AI_AGENT_EVALUATION_RUNS_KEY,
                    projectUuid,
                    agentUuid,
                    evalUuid,
                ],
            });
        },
        onError: handleError,
    });
};

export const useUpdateEvaluation = (
    projectUuid: string | undefined,
    agentUuid: string | undefined,
) => {
    const handleError = useEvaluationErrorHandler(
        projectUuid,
        i18n.t('toasts.evaluations.updateFailed', { ns: 'aiAgent' }),
    );
    const { showToastSuccess } = useToaster();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            evalUuid,
            data,
        }: {
            evalUuid: string;
            data: ApiUpdateEvaluationRequest;
        }) => updateEvaluation(projectUuid!, agentUuid!, evalUuid, data),
        onSuccess: (_, { evalUuid }) => {
            showToastSuccess({
                title: i18n.t('toasts.evaluations.updated', { ns: 'aiAgent' }),
            });
            void queryClient.invalidateQueries({
                queryKey: [AI_AGENT_EVALUATIONS_KEY, projectUuid, agentUuid],
            });
            void queryClient.invalidateQueries({
                queryKey: [
                    AI_AGENT_EVALUATIONS_KEY,
                    projectUuid,
                    agentUuid,
                    evalUuid,
                ],
            });
        },
        onError: handleError,
    });
};

export const useAppendToEvaluation = (
    projectUuid: string | undefined,
    agentUuid: string | undefined,
) => {
    const handleError = useEvaluationErrorHandler(
        projectUuid,
        i18n.t('toasts.evaluations.addFailed', { ns: 'aiAgent' }),
    );
    const { showToastSuccess } = useToaster();
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    return useMutation({
        mutationFn: ({
            evalUuid,
            data,
        }: {
            evalUuid: string;
            data: ApiAppendEvaluationRequest;
        }) => appendToEvaluation(projectUuid!, agentUuid!, evalUuid, data),
        onSuccess: (_, { evalUuid }) => {
            showToastSuccess({
                title: i18n.t('toasts.evaluations.promptAdded', {
                    ns: 'aiAgent',
                }),
                action: {
                    children: i18n.t('toasts.evaluations.goToEvaluation', {
                        ns: 'aiAgent',
                    }),
                    icon: IconArrowRight,
                    onClick: () => {
                        void navigate(
                            `/projects/${projectUuid}/ai-agents/${agentUuid}/edit/evals/${evalUuid}`,
                        );
                    },
                },
            });
            void queryClient.invalidateQueries({
                queryKey: [AI_AGENT_EVALUATIONS_KEY, projectUuid, agentUuid],
            });
            void queryClient.invalidateQueries({
                queryKey: [
                    AI_AGENT_EVALUATIONS_KEY,
                    projectUuid,
                    agentUuid,
                    evalUuid,
                ],
            });
        },
        onError: handleError,
    });
};

export const useDeleteEvaluation = (
    projectUuid: string | undefined,
    agentUuid: string | undefined,
) => {
    const handleError = useEvaluationErrorHandler(
        projectUuid,
        i18n.t('toasts.evaluations.deleteFailed', { ns: 'aiAgent' }),
    );
    const { showToastSuccess } = useToaster();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (evalUuid: string) =>
            deleteEvaluation(projectUuid!, agentUuid!, evalUuid),
        onSuccess: () => {
            showToastSuccess({
                title: i18n.t('toasts.evaluations.deleted', { ns: 'aiAgent' }),
            });
            void queryClient.invalidateQueries({
                queryKey: [AI_AGENT_EVALUATIONS_KEY, projectUuid, agentUuid],
            });
        },
        onError: handleError,
    });
};

export const useEvaluationRunPolling = (
    projectUuid: string,
    agentUuid: string,
    evalUuid: string,
    evalRun:
        | Pick<AiAgentEvaluationRunSummary, 'status' | 'runUuid'>
        | undefined,
) => {
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const queryClient = useQueryClient();

    const isPollingNeeded =
        evalRun?.status === 'pending' || evalRun?.status === 'running';
    const runUuid = evalRun?.runUuid;

    useEffect(() => {
        if (
            !runUuid ||
            !projectUuid ||
            !agentUuid ||
            !evalUuid ||
            !isPollingNeeded
        ) {
            return;
        }

        const pollStatus = async () => {
            try {
                const currentRunData = await getEvaluationRunResults(
                    projectUuid,
                    agentUuid,
                    evalUuid,
                    runUuid,
                );

                const shouldContinuePolling =
                    currentRunData?.status === 'pending' ||
                    currentRunData?.status === 'running';

                queryClient.setQueryData<
                    ApiAiAgentEvaluationRunResultsResponse['results']
                >(
                    [
                        AI_AGENT_EVALUATION_RUNS_KEY,
                        projectUuid,
                        agentUuid,
                        evalUuid,
                        runUuid,
                    ],
                    currentRunData,
                );

                if (shouldContinuePolling) {
                    timeoutRef.current = setTimeout(
                        pollStatus,
                        POLLING_INTERVAL,
                    );
                } else {
                    void queryClient.invalidateQueries({
                        queryKey: [
                            AI_AGENT_EVALUATION_RUNS_KEY,
                            projectUuid,
                            agentUuid,
                            evalUuid,
                        ],
                    });
                }
            } catch (error) {
                console.error('Error polling evaluation run status:', error);
            }
        };

        timeoutRef.current = setTimeout(pollStatus, POLLING_INTERVAL);

        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
        };
    }, [
        projectUuid,
        agentUuid,
        evalUuid,
        runUuid,
        queryClient,
        isPollingNeeded,
    ]);
};
