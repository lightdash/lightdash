import {
    type AiAgentSummary,
    type AiPromptContext,
    type AiPromptContextInput,
    type AiRouterDecisionCandidate,
    type AiRouterRouteResponseResult,
} from '@lightdash/common';
import { useCallback, useMemo, useReducer } from 'react';
import { useAiRouterCommit, useAiRouterRoute } from './useAiRouter';

type AiAgentRouterPhase<TPayload> =
    | { kind: 'idle' }
    | { kind: 'routing' }
    | { kind: 'creating' }
    | {
          kind: 'picker';
          context?: AiPromptContextInput;
          decision: AiRouterRouteResponseResult;
          optimisticContext?: AiPromptContext;
          payload: TPayload;
          prompt: string;
          toolHints: string[];
      };

type AiAgentRouterAction<TPayload> =
    | { type: 'idle' }
    | { type: 'routing' }
    | { type: 'creating' }
    | {
          type: 'picker';
          context?: AiPromptContextInput;
          decision: AiRouterRouteResponseResult;
          optimisticContext?: AiPromptContext;
          payload: TPayload;
          prompt: string;
          toolHints: string[];
      };

export type AiAgentRouterSubmitArgs<TPayload = undefined> = {
    message: string;
    toolHints: string[];
    context?: AiPromptContextInput;
    optimisticContext?: AiPromptContext;
    payload: TPayload;
};

type CreateThreadForAgent<TPayload> = (args: {
    agentUuid: string;
    context?: AiPromptContextInput;
    message: string;
    optimisticContext?: AiPromptContext;
    payload: TPayload;
    toolHints: string[];
}) => Promise<{ uuid: string }>;

export type AiAgentRouterCandidate = AiRouterDecisionCandidate & {
    agent: AiAgentSummary | undefined;
    isRecommended: boolean;
};

const aiAgentRouterReducer = <TPayload>(
    phase: AiAgentRouterPhase<TPayload>,
    action: AiAgentRouterAction<TPayload>,
): AiAgentRouterPhase<TPayload> => {
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
                payload: action.payload,
                prompt: action.prompt,
                toolHints: action.toolHints,
            };
        default:
            return phase;
    }
};

export const useAiAgentRouterFlow = <TPayload = undefined>({
    agents,
    createThreadForAgent,
    onRouteError,
    projectUuid,
}: {
    agents: AiAgentSummary[];
    createThreadForAgent: CreateThreadForAgent<TPayload>;
    onRouteError?: (
        args: AiAgentRouterSubmitArgs<TPayload> & {
            fallbackAgent?: AiAgentSummary;
        },
    ) => void | Promise<void>;
    projectUuid: string | undefined;
}) => {
    const [phase, dispatch] = useReducer(aiAgentRouterReducer<TPayload>, {
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
            payload,
            toolHints,
        }: AiAgentRouterSubmitArgs<TPayload> & {
            agentUuid: string;
            decisionUuid?: string;
        }) => {
            dispatch({ type: decisionUuid ? 'creating' : 'idle' });
            const thread = await createThreadForAgent({
                agentUuid,
                context,
                message,
                optimisticContext,
                payload,
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
            payload,
        }: AiAgentRouterSubmitArgs<TPayload>) => {
            if (!projectUuid) return;

            let result: AiRouterRouteResponseResult;
            try {
                dispatch({ type: 'routing' });
                result = await routePrompt({
                    prompt: message,
                    projectUuid,
                });
            } catch {
                dispatch({ type: 'idle' });
                await onRouteError?.({
                    context,
                    fallbackAgent: agents[0],
                    message,
                    optimisticContext,
                    payload,
                    toolHints,
                });
                return;
            }

            if (result.nextAction === 'create_thread') {
                try {
                    await createAndCommitThread({
                        agentUuid: result.decision.suggestedAgentUuid,
                        decisionUuid: result.decision.decisionUuid,
                        message,
                        context,
                        optimisticContext,
                        payload,
                        toolHints,
                    });
                } catch (error) {
                    dispatch({ type: 'idle' });
                    throw error;
                }
            } else {
                dispatch({
                    type: 'picker',
                    context,
                    decision: result,
                    optimisticContext,
                    payload,
                    prompt: message,
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
                payload: phase.payload,
                toolHints: phase.toolHints,
            }).catch(() => {
                dispatch({
                    type: 'picker',
                    context: phase.context,
                    decision: phase.decision,
                    optimisticContext: phase.optimisticContext,
                    payload: phase.payload,
                    prompt: phase.prompt,
                    toolHints: phase.toolHints,
                });
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
