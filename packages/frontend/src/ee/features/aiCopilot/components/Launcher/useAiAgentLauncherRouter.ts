import {
    type AiAgentSummary,
    type AiPromptContext,
    type AiPromptContextInput,
    type AiRouterDecisionCandidate,
    type AiRouterRouteResponseResult,
} from '@lightdash/common';
import { useCallback, useMemo, useReducer } from 'react';
import { useAiRouterCommit, useAiRouterRoute } from '../../hooks/useAiRouter';
import {
    mergeAiPromptContextInput,
    mergeAiPromptContextItems,
} from '../ChatElements/contentMentions';
import {
    isLauncherAutoAgent,
    type LauncherSelectedAgent,
} from './launcherAgentSelection';

type LauncherRouterPhase =
    | { kind: 'idle' }
    | { kind: 'routing' }
    | { kind: 'creating' }
    | {
          kind: 'picker';
          context?: AiPromptContextInput;
          decision: AiRouterRouteResponseResult;
          optimisticContext?: AiPromptContext;
          prompt: string;
          toolHints: string[];
      };

type LauncherRouterAction =
    | { type: 'idle' }
    | { type: 'routing' }
    | { type: 'creating' }
    | {
          type: 'picker';
          context?: AiPromptContextInput;
          decision: AiRouterRouteResponseResult;
          optimisticContext?: AiPromptContext;
          prompt: string;
          toolHints: string[];
      };

type SubmitArgs = {
    message: string;
    toolHints: string[];
    context?: AiPromptContextInput;
    optimisticContext?: AiPromptContext;
};

type CreateThreadForAgent = (args: {
    agentUuid: string;
    context?: AiPromptContextInput;
    message: string;
    optimisticContext?: AiPromptContext;
    toolHints: string[];
}) => Promise<{ uuid: string }>;

export type LauncherRouterCandidate = AiRouterDecisionCandidate & {
    agent: AiAgentSummary | undefined;
    isRecommended: boolean;
};

const launcherRouterReducer = (
    phase: LauncherRouterPhase,
    action: LauncherRouterAction,
): LauncherRouterPhase => {
    switch (action.type) {
        case 'idle':
            return { kind: 'idle' };
        case 'routing':
            return { kind: 'routing' };
        case 'creating':
            return { kind: 'creating' };
        case 'picker':
            return {
                kind: 'picker',
                context: action.context,
                decision: action.decision,
                optimisticContext: action.optimisticContext,
                prompt: action.prompt,
                toolHints: action.toolHints,
            };
        default:
            return phase;
    }
};

export const useAiAgentLauncherRouter = ({
    agent,
    agents,
    contextInput,
    createThreadForAgent,
    isCreatingThread,
    isPinnedContextReady,
    previewItems,
    projectUuid,
}: {
    agent: NonNullable<LauncherSelectedAgent>;
    agents: AiAgentSummary[];
    contextInput: AiPromptContextInput;
    createThreadForAgent: CreateThreadForAgent;
    isCreatingThread: boolean;
    isPinnedContextReady: boolean;
    previewItems: AiPromptContext;
    projectUuid: string;
}) => {
    const [routerPhase, dispatch] = useReducer(launcherRouterReducer, {
        kind: 'idle',
    });
    const { mutateAsync: routePrompt } = useAiRouterRoute();
    const { mutate: commitDecisionMutate } = useAiRouterCommit();
    const agentsByUuid = useMemo(
        () => new Map(agents.map((candidate) => [candidate.uuid, candidate])),
        [agents],
    );

    const createAndCommitThread = useCallback(
        async ({
            agentUuid,
            context,
            decisionUuid,
            message,
            optimisticContext,
            toolHints,
        }: {
            agentUuid: string;
            context?: AiPromptContextInput;
            decisionUuid?: string;
            message: string;
            optimisticContext?: AiPromptContext;
            toolHints: string[];
        }) => {
            dispatch({ type: decisionUuid ? 'creating' : 'idle' });
            const thread = await createThreadForAgent({
                agentUuid,
                context,
                message,
                optimisticContext,
                toolHints,
            });
            if (decisionUuid) {
                commitDecisionMutate({
                    decisionUuid,
                    chosenAgentUuid: agentUuid,
                    threadUuid: thread.uuid,
                });
            }
        },
        [commitDecisionMutate, createThreadForAgent],
    );

    const handleSubmit = useCallback(
        async ({
            message,
            toolHints,
            context,
            optimisticContext,
        }: SubmitArgs) => {
            if (!isPinnedContextReady) return;

            const mergedContext = mergeAiPromptContextInput(
                contextInput,
                context,
            );
            const mergedOptimisticContext = mergeAiPromptContextItems(
                previewItems,
                optimisticContext,
            );

            if (!isLauncherAutoAgent(agent)) {
                void createAndCommitThread({
                    agentUuid: agent.uuid,
                    message,
                    context: mergedContext,
                    optimisticContext: mergedOptimisticContext,
                    toolHints,
                });
                return;
            }

            dispatch({ type: 'routing' });
            try {
                const result = await routePrompt({
                    prompt: message,
                    projectUuid,
                });
                if (result.nextAction === 'create_thread') {
                    await createAndCommitThread({
                        agentUuid: result.decision.suggestedAgentUuid,
                        decisionUuid: result.decision.decisionUuid,
                        message,
                        context: mergedContext,
                        optimisticContext: mergedOptimisticContext,
                        toolHints,
                    });
                } else {
                    dispatch({
                        type: 'picker',
                        context: mergedContext,
                        decision: result,
                        optimisticContext: mergedOptimisticContext,
                        prompt: message,
                        toolHints,
                    });
                }
            } catch {
                const fallback = agents[0];
                dispatch({ type: 'idle' });
                if (fallback) {
                    void createAndCommitThread({
                        agentUuid: fallback.uuid,
                        message,
                        context: mergedContext,
                        optimisticContext: mergedOptimisticContext,
                        toolHints,
                    });
                }
            }
        },
        [
            agent,
            agents,
            contextInput,
            createAndCommitThread,
            isPinnedContextReady,
            previewItems,
            projectUuid,
            routePrompt,
        ],
    );

    const confirmPick = useCallback(
        (agentUuid: string) => {
            if (routerPhase.kind !== 'picker') return;
            void createAndCommitThread({
                agentUuid,
                context: routerPhase.context,
                decisionUuid: routerPhase.decision.decision.decisionUuid,
                message: routerPhase.prompt,
                optimisticContext: routerPhase.optimisticContext,
                toolHints: routerPhase.toolHints,
            });
        },
        [createAndCommitThread, routerPhase],
    );

    const sortedCandidates = useMemo<LauncherRouterCandidate[]>(() => {
        if (routerPhase.kind !== 'picker') return [];
        const { candidates, suggestedAgentUuid } =
            routerPhase.decision.decision;
        return [...candidates]
            .sort((a, b) => {
                if (a.agentUuid === suggestedAgentUuid) return -1;
                if (b.agentUuid === suggestedAgentUuid) return 1;
                return 0;
            })
            .map((candidate) => ({
                ...candidate,
                agent: agentsByUuid.get(candidate.agentUuid),
                isRecommended: candidate.agentUuid === suggestedAgentUuid,
            }));
    }, [agentsByUuid, routerPhase]);

    const isRouting = routerPhase.kind === 'routing';
    const isCreating = routerPhase.kind === 'creating';
    const isPickingAgent = routerPhase.kind === 'picker';

    return {
        confirmPick,
        handleSubmit,
        isLocked: isCreatingThread || isRouting || isCreating,
        isPickingAgent,
        isRouting,
        sortedCandidates,
    };
};
