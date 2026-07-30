import {
    type AnyType,
    type AiDeepResearchEntryPoint,
    type AiDeepResearchEventsPage,
    type AiDeepResearchRequestBody,
    type AiDeepResearchRun,
    type ApiAiDeepResearchEventsResponse,
    type ApiAiDeepResearchRunListResponse,
    type ApiAiDeepResearchRunResponse,
    type ApiAiAgentThreadMessageVizQuery,
    type ApiAiAgentThreadMessageVizQueryResponse,
    type ApiError,
    isAiDeepResearchRunTerminal,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { lightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';
import useUser from '../../../../hooks/user/useUser';
import useApp from '../../../../providers/App/useApp';
import useTracking from '../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../types/Events';
import {
    registerDeepResearchRun,
    replaceDeepResearchRun,
    restoreDeepResearchComposerPrompt,
    updateDeepResearchRun,
    useDeepResearchRunsForThread,
} from '../deepResearch/deepResearchRegistry';
import { getDeepResearchRunRefetchInterval } from '../deepResearch/runPolling';
import {
    adaptDeepResearchRun,
    DEEP_RESEARCH_DEPTH_CONFIG,
    isDeepResearchRunTerminal,
    toDeepResearchRegistration,
} from '../deepResearch/runProgress';
import {
    type DeepResearchRunRegistration,
    type StartDeepResearchArgs,
} from '../deepResearch/types';

const DEEP_RESEARCH_QUERY_KEY = 'deepResearch';
const DEEP_RESEARCH_POLL_INTERVAL_MS = 2_000;
const DEEP_RESEARCH_EVENT_PAGE_SIZE = 100;

const getBaseUrl = (projectUuid: string) =>
    `/ee/projects/${projectUuid}/ai-deep-research`;

const startDeepResearch = (
    projectUuid: string,
    data: AiDeepResearchRequestBody,
) =>
    lightdashApi<AnyType>({
        version: 'v1',
        url: getBaseUrl(projectUuid),
        method: 'POST',
        body: JSON.stringify(data),
    }) as Promise<ApiAiDeepResearchRunResponse['results']>;

const getDeepResearchRun = (projectUuid: string, runUuid: string) =>
    lightdashApi<AnyType>({
        version: 'v1',
        url: `${getBaseUrl(projectUuid)}/${runUuid}`,
        method: 'GET',
        body: undefined,
    }) as Promise<ApiAiDeepResearchRunResponse['results']>;

const listDeepResearchRuns = (projectUuid: string, threadUuid: string) =>
    lightdashApi<AnyType>({
        version: 'v1',
        url: `${getBaseUrl(projectUuid)}?threadUuid=${threadUuid}`,
        method: 'GET',
        body: undefined,
    }) as Promise<ApiAiDeepResearchRunListResponse['results']>;

const getDeepResearchEventsPage = (
    projectUuid: string,
    runUuid: string,
    cursor?: string,
) =>
    lightdashApi<AnyType>({
        version: 'v1',
        url: `${getBaseUrl(projectUuid)}/${runUuid}/events?limit=${DEEP_RESEARCH_EVENT_PAGE_SIZE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        method: 'GET',
        body: undefined,
    }) as Promise<ApiAiDeepResearchEventsResponse['results']>;

const getDeepResearchEvents = async (
    projectUuid: string,
    runUuid: string,
): Promise<AiDeepResearchEventsPage> => {
    const events: AiDeepResearchEventsPage['events'] = [];
    let cursor: string | undefined;
    while (true) {
        const page = await getDeepResearchEventsPage(
            projectUuid,
            runUuid,
            cursor,
        );
        events.push(...page.events);
        const nextCursor = page.nextCursor ?? undefined;
        if (
            !nextCursor ||
            nextCursor === cursor ||
            page.events.length < DEEP_RESEARCH_EVENT_PAGE_SIZE
        ) {
            break;
        }
        cursor = nextCursor;
    }
    return { events, nextCursor: null };
};

const cancelDeepResearch = (projectUuid: string, runUuid: string) =>
    lightdashApi<AnyType>({
        version: 'v1',
        url: `${getBaseUrl(projectUuid)}/${runUuid}/cancel`,
        method: 'POST',
        body: JSON.stringify({}),
    }) as Promise<ApiAiDeepResearchRunResponse['results']>;

const refreshDeepResearchChart = (
    projectUuid: string,
    runUuid: string,
    chartKey: string,
) =>
    lightdashApi<AnyType>({
        version: 'v1',
        url: `${getBaseUrl(projectUuid)}/${runUuid}/charts/${encodeURIComponent(chartKey)}/refresh`,
        method: 'POST',
        body: JSON.stringify({}),
    }) as Promise<ApiAiAgentThreadMessageVizQueryResponse['results']>;

type StartMutationVariables = StartDeepResearchArgs & {
    promptUuid: string;
};

type StartMutationIds = {
    agentUuid: string;
    threadUuid: string;
};

const useStartDeepResearchMutationBase = <
    Variables extends StartMutationVariables,
>(
    projectUuid: string,
    getIds: (variables: Variables) => StartMutationIds,
    entryPoint: AiDeepResearchEntryPoint,
) => {
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    const user = useUser(true);
    return useMutation<
        AiDeepResearchRun,
        ApiError,
        Variables,
        { optimisticRunUuid: string; createdAt: string }
    >({
        onMutate: (variables) => {
            const { agentUuid, threadUuid } = getIds(variables);
            const optimisticRunUuid = `starting-${crypto.randomUUID()}`;
            const createdAt = new Date().toISOString();
            registerDeepResearchRun({
                runUuid: optimisticRunUuid,
                projectUuid,
                agentUuid,
                threadUuid,
                promptUuid: variables.promptUuid,
                mcpServerUuids: variables.mcpServerUuids,
                userUuid: user.data?.userUuid ?? '',
                question: variables.question,
                depth: variables.depth,
                createdAt,
                state: 'starting',
            });
            return { optimisticRunUuid, createdAt };
        },
        mutationFn: (variables) => {
            const { agentUuid, threadUuid } = getIds(variables);
            return startDeepResearch(projectUuid, {
                prompt: variables.question,
                agentUuid,
                effort: DEEP_RESEARCH_DEPTH_CONFIG[variables.depth].effort,
                threadUuid,
                promptUuid: variables.promptUuid,
                mcpServerUuids: variables.mcpServerUuids,
                entryPoint,
            });
        },
        onSuccess: (run, variables, context) => {
            const { agentUuid, threadUuid } = getIds(variables);
            replaceDeepResearchRun(context?.optimisticRunUuid ?? '', {
                runUuid: run.aiDeepResearchRunUuid,
                projectUuid,
                agentUuid,
                threadUuid,
                promptUuid: variables.promptUuid,
                mcpServerUuids: variables.mcpServerUuids,
                userUuid: user.data?.userUuid ?? '',
                question: variables.question,
                depth: variables.depth,
                createdAt: context?.createdAt ?? new Date().toISOString(),
                state: 'started',
            });
            void queryClient.invalidateQueries({
                queryKey: [
                    DEEP_RESEARCH_QUERY_KEY,
                    projectUuid,
                    'thread',
                    threadUuid,
                ],
            });
        },
        onError: ({ error }, _variables, context) => {
            if (context) {
                updateDeepResearchRun(context.optimisticRunUuid, {
                    state: 'start_failed',
                    errorMessage: error.message,
                });
            }
            const { threadUuid } = getIds(_variables);
            restoreDeepResearchComposerPrompt(threadUuid, _variables.question);
            showToastApiError({
                title: 'Could not start research',
                apiError: error,
            });
        },
    });
};

export const useStartDeepResearchMutation = ({
    projectUuid,
    agentUuid,
    threadUuid,
    entryPoint = 'ask_ai',
}: {
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    entryPoint?: AiDeepResearchEntryPoint;
}) =>
    useStartDeepResearchMutationBase<StartMutationVariables>(
        projectUuid,
        () => ({ agentUuid, threadUuid }),
        entryPoint,
    );

type StartForThreadMutationVariables = StartMutationVariables &
    StartMutationIds;

export const useStartDeepResearchForThreadMutation = (
    projectUuid: string,
    entryPoint: AiDeepResearchEntryPoint = 'ask_ai',
) =>
    useStartDeepResearchMutationBase<StartForThreadMutationVariables>(
        projectUuid,
        ({ agentUuid, threadUuid }) => ({ agentUuid, threadUuid }),
        entryPoint,
    );

const useDeepResearchThreadRuns = (
    projectUuid: string | undefined,
    threadUuid: string,
) =>
    useQuery<AiDeepResearchRun[], ApiError>({
        queryKey: [DEEP_RESEARCH_QUERY_KEY, projectUuid, 'thread', threadUuid],
        queryFn: () => listDeepResearchRuns(projectUuid ?? '', threadUuid),
        enabled: !!projectUuid,
    });

type DeepResearchEngagementRun = Pick<
    AiDeepResearchRun,
    | 'aiDeepResearchRunUuid'
    | 'projectUuid'
    | 'agentUuid'
    | 'aiThreadUuid'
    | 'status'
    | 'completedAt'
    | 'updatedAt'
>;

export const useTrackDeepResearchReportEngagement = () => {
    const { user } = useApp();
    const { track } = useTracking();

    return useCallback(
        (
            action: 'opened' | 'copied' | 'shared' | 'follow_up',
            run: DeepResearchEngagementRun,
        ) => {
            const userId = user?.data?.userUuid;
            const organizationId = user?.data?.organizationUuid;
            if (
                !userId ||
                !organizationId ||
                !isAiDeepResearchRunTerminal(run.status)
            ) {
                return;
            }

            const completedAt = run.completedAt ?? run.updatedAt;
            track({
                name: EventName.AI_DEEP_RESEARCH_REPORT_ENGAGED,
                properties: {
                    action,
                    organizationId,
                    projectId: run.projectUuid,
                    userId,
                    runUuid: run.aiDeepResearchRunUuid,
                    threadId: run.aiThreadUuid,
                    aiAgentId: run.agentUuid,
                    runStatus: run.status,
                    timeSinceCompletedMs: Math.max(
                        0,
                        Date.now() - new Date(completedAt).getTime(),
                    ),
                },
            });
        },
        [track, user?.data?.organizationUuid, user?.data?.userUuid],
    );
};

export const useTrackDeepResearchFollowUp = ({
    projectUuid,
    threadUuid,
}: {
    projectUuid: string;
    threadUuid: string;
}) => {
    const runsQuery = useDeepResearchThreadRuns(projectUuid, threadUuid);
    const trackEngagement = useTrackDeepResearchReportEngagement();

    return useCallback(() => {
        const latestTerminalRun = runsQuery.data
            ?.filter((run) => isAiDeepResearchRunTerminal(run.status))
            .toSorted(
                (left, right) =>
                    new Date(right.completedAt ?? right.updatedAt).getTime() -
                    new Date(left.completedAt ?? left.updatedAt).getTime(),
            )[0];
        if (latestTerminalRun) {
            trackEngagement('follow_up', latestTerminalRun);
        }
    }, [runsQuery.data, trackEngagement]);
};

export const useDeepResearchThreadRunRegistrations = ({
    projectUuid,
    threadUuid,
}: {
    projectUuid: string | undefined;
    threadUuid: string;
}) => {
    const user = useUser(true);
    const userUuid = user.data?.userUuid;
    const serverRuns = useDeepResearchThreadRuns(projectUuid, threadUuid);
    const localRegistrations = useDeepResearchRunsForThread(
        projectUuid ?? '',
        threadUuid,
        userUuid,
    );

    return useMemo(() => {
        const fromServer = (serverRuns.data ?? []).map((run) =>
            toDeepResearchRegistration(run, {
                threadUuid,
                userUuid: userUuid ?? '',
            }),
        );
        const serverRunUuids = new Set(
            fromServer.map((registration) => registration.runUuid),
        );
        return [
            ...fromServer,
            ...localRegistrations.filter(
                (registration) => !serverRunUuids.has(registration.runUuid),
            ),
        ];
    }, [serverRuns.data, localRegistrations, threadUuid, userUuid]);
};

export const useDeepResearchRun = (
    registration: DeepResearchRunRegistration,
) => {
    const runQuery = useQuery<AiDeepResearchRun, ApiError>({
        queryKey: [
            DEEP_RESEARCH_QUERY_KEY,
            registration.projectUuid,
            registration.runUuid,
        ],
        queryFn: () =>
            getDeepResearchRun(registration.projectUuid, registration.runUuid),
        enabled: registration.state === 'started',
        refetchInterval: (run) =>
            getDeepResearchRunRefetchInterval(
                run,
                DEEP_RESEARCH_POLL_INTERVAL_MS,
            ),
    });
    const isRunActive = runQuery.data
        ? !isDeepResearchRunTerminal(runQuery.data.status)
        : true;
    const eventsQuery = useQuery<AiDeepResearchEventsPage, ApiError>({
        queryKey: [
            DEEP_RESEARCH_QUERY_KEY,
            registration.projectUuid,
            registration.runUuid,
            'events',
        ],
        queryFn: () =>
            getDeepResearchEvents(
                registration.projectUuid,
                registration.runUuid,
            ),
        enabled: registration.state === 'started',
        refetchInterval: isRunActive ? DEEP_RESEARCH_POLL_INTERVAL_MS : false,
    });

    return {
        ...runQuery,
        data: runQuery.data
            ? adaptDeepResearchRun({
                  run: runQuery.data,
                  events: eventsQuery.data?.events ?? [],
                  registration,
              })
            : undefined,
        eventsQuery,
    };
};

export const useCancelDeepResearchMutation = (
    projectUuid: string,
    runUuid: string,
) => {
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    return useMutation<AiDeepResearchRun, ApiError>({
        mutationFn: () => cancelDeepResearch(projectUuid, runUuid),
        onSuccess: (run) => {
            queryClient.setQueryData(
                [DEEP_RESEARCH_QUERY_KEY, projectUuid, runUuid],
                run,
            );
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Could not stop research',
                apiError: error,
            });
        },
    });
};

/**
 * Re-executes the stored metric query behind a warehouse-backed report
 * chart. Only runs when the user asks for live data (`enabled`).
 */
export const useDeepResearchChartLiveQuery = ({
    projectUuid,
    runUuid,
    chartKey,
    enabled,
}: {
    projectUuid: string;
    runUuid: string;
    chartKey: string;
    enabled: boolean;
}) =>
    useQuery<ApiAiAgentThreadMessageVizQuery, ApiError>({
        queryKey: [
            DEEP_RESEARCH_QUERY_KEY,
            projectUuid,
            runUuid,
            'charts',
            chartKey,
            'live',
        ],
        queryFn: () => refreshDeepResearchChart(projectUuid, runUuid, chartKey),
        enabled,
        staleTime: Infinity,
        refetchOnWindowFocus: false,
    });

export const useContinueDeepResearchMutation = ({
    projectUuid,
    agentUuid,
    threadUuid,
}: {
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
}) => useStartDeepResearchMutation({ projectUuid, agentUuid, threadUuid });
