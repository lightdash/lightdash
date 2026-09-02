import {
    type AiAgentSummary,
    type AiPromptContext,
    type AiPromptContextInput,
    type AiRouterDecisionCandidate,
    type AiRouterRouteResponseResult,
} from '@lightdash/common';
import { useCallback, useMemo, useReducer } from 'react';
import { useAiRouterCommit, useAiRouterRoute } from './useAiRouter';

type AiAgentRouterPhase =
    | { kind: 'idle' }
    | { kind: 'routing' }
    | { kind: 'creating' }
    | {
          kind: 'picker';
          context?: AiPromptContextInput;
          decision: AiRouterRouteResponseResult;
          optimisticContext?: AiPromptContext;
          createThreadForAgent?: CreateThreadForAgent;
          prompt: string;
          toolHints: string[];
      };

type AiAgentRouterAction =
    | { type: 'idle' }
    | { type: 'routing' }
    | { type: 'creating' }
    | {
          type: 'picker';
          context?: AiPromptContextInput;
          decision: AiRouterRouteResponseResult;
          optimisticContext?: AiPromptContext;
          createThreadForAgent?: CreateThreadForAgent;
          prompt: string;
          toolHints: string[];
      };

export type AiAgentRouterSubmitArgs = {
    message: string;
    toolHints: string[];
    context?: AiPromptContextInput;
    optimisticContext?: AiPromptContext;
    createThreadForAgent?: CreateThreadForAgent;
};

export type CreateThreadForAgent = (args: {
    agentUuid: string;
    context?: AiPromptContextInput;
    message: string;
    optimisticContext?: AiPromptContext;
    toolHints: string[];
}) => Promise<{ uuid: string }>;

export type AiAgentRouterErrorArgs = AiAgentRouterSubmitArgs & {
    fallbackAgent?: AiAgentSummary;
};

export type AiAgentRouterCandidate = AiRouterDecisionCandidate & {
    agent: AiAgentSummary | undefined;
    isRecommended: boolean;
};

const aiAgentRouterReducer = (
    phase: AiAgentRouterPhase,
    action: AiAgentRouterAction,
): AiAgentRouterPhase => {
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
                createThreadForAgent: action.createThreadForAgent,
                prompt: action.prompt,
                toolHints: action.toolHints,
            };
        default:
            return phase;
    }
};

export const useAiAgentRouterFlow = ({
    agents,
    createThreadForAgent,
    onRouteError,
    projectUuid,
}: {
    agents: AiAgentSummary[];
    createThreadForAgent: CreateThreadForAgent;
    onRouteError?: (args: AiAgentRouterErrorArgs) => void;
    projectUuid: string | undefined;
}) => {
    const [phase, dispatch] = useReducer(aiAgentRouterReducer, {
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
            createThreadForAgent: createThreadForAgentOverride,
            toolHints,
        }: AiAgentRouterSubmitArgs & {
            agentUuid: string;
            decisionUuid?: string;
        }) => {
            dispatch({ type: decisionUuid ? 'creating' : 'idle' });
            const thread = await (
                createThreadForAgentOverride ?? createThreadForAgent
            )({
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
            createThreadForAgent: createThreadForAgentOverride,
        }: AiAgentRouterSubmitArgs) => {
            if (!projectUuid) return;

            let hasRouted = false;
            dispatch({ type: 'routing' });
            try {
                const result = await routePrompt({
                    prompt: message,
                    projectUuid,
                });
                hasRouted = true;

                if (result.nextAction === 'create_thread') {
                    await createAndCommitThread({
                        agentUuid: result.decision.suggestedAgentUuid,
                        decisionUuid: result.decision.decisionUuid,
                        message,
                        context,
                        optimisticContext,
                        createThreadForAgent: createThreadForAgentOverride,
                        toolHints,
                    });
                } else {
                    dispatch({
                        type: 'picker',
                        context,
                        decision: result,
                        optimisticContext,
                        createThreadForAgent: createThreadForAgentOverride,
                        prompt: message,
                        toolHints,
                    });
                }
            } catch {
                dispatch({ type: 'idle' });
                if (hasRouted) {
                    return;
                }
                onRouteError?.({
                    context,
                    fallbackAgent: agents[0],
                    message,
                    optimisticContext,
                    ...(createThreadForAgentOverride
                        ? {
                              createThreadForAgent:
                                  createThreadForAgentOverride,
                          }
                        : {}),
                    toolHints,
                });
            }
        },
        [agents, createAndCommitThread, onRouteError, projectUuid, routePrompt],
    );

    const confirmPick = useCallback(
        (agentUuid: string) => {
            if (phase.kind !== 'picker') return;
            void createAndCommitThread({
                agentUuid,
                context: phase.context,
                decisionUuid: phase.decision.decision.decisionUuid,
                message: phase.prompt,
                optimisticContext: phase.optimisticContext,
                createThreadForAgent: phase.createThreadForAgent,
                toolHints: phase.toolHints,
            });
        },
        [createAndCommitThread, phase],
    );

    const sortedCandidates = useMemo<AiAgentRouterCandidate[]>(() => {
        if (phase.kind !== 'picker') return [];
        const { candidates, suggestedAgentUuid } = phase.decision.decision;
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
    }, [agentsByUuid, phase]);

    const isRouting = phase.kind === 'routing';
    const isCreating = phase.kind === 'creating';
    const isPickingAgent = phase.kind === 'picker';

    return {
        confirmPick,
        handleSubmit,
        isCreating,
        isLocked: phase.kind !== 'idle',
        isPickingAgent,
        isRouting,
        phase,
        sortedCandidates,
    };
};
