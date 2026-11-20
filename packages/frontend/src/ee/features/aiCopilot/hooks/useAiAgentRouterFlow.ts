import {
    type AiAgentSummary,
    type AiPromptContext,
    type AiPromptContextInput,
    type AiRouterDecisionCandidate,
    type AiRouterRouteResponseResult,
} from '@lightdash/common';
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
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

/** The submitter's promise for a message held at the picker. */
type HeldSubmission = {
    resolve: () => void;
    reject: (reason: unknown) => void;
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
    /** Awaited, so a failed fallback creation still reaches the submitter. */
    onRouteError?: (args: AiAgentRouterErrorArgs) => Promise<unknown> | void;
    projectUuid: string | undefined;
}) => {
    const [phase, dispatch] = useReducer(aiAgentRouterReducer, {
        kind: 'idle',
    });
    // A submission settles only once its conversation exists or cannot: the
    // composer keeps the draft and its uploads until then.
    const heldSubmissionRef = useRef<HeldSubmission | null>(null);
    useEffect(
        () => () => {
            // Leaving at the picker abandons the message, so the composer
            // releases the uploads instead of waiting for a claim.
            heldSubmissionRef.current?.reject(
                new Error('The agent pick was abandoned'),
            );
            heldSubmissionRef.current = null;
        },
        [],
    );
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

    // Routes a message. A stop at the picker returns `created`, which settles
    // once the held message has its conversation, or cannot get one. It is
    // wrapped so that awaiting the routing does not also await the pick.
    const route = useCallback(
        async ({
            message,
            toolHints,
            context,
            optimisticContext,
            createThreadForAgent: createThreadForAgentOverride,
        }: AiAgentRouterSubmitArgs): Promise<
            { created: Promise<void> } | undefined
        > => {
            if (!projectUuid) return undefined;

            dispatch({ type: 'routing' });
            let result: AiRouterRouteResponseResult;
            try {
                // Routing reads the text and what is pinned, never file contents.
                result = await routePrompt({
                    prompt: message,
                    projectUuid,
                    context,
                });
            } catch {
                dispatch({ type: 'idle' });
                await onRouteError?.({
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
                return undefined;
            }

            if (result.nextAction === 'create_thread') {
                try {
                    await createAndCommitThread({
                        agentUuid: result.decision.suggestedAgentUuid,
                        decisionUuid: result.decision.decisionUuid,
                        message,
                        context,
                        optimisticContext,
                        createThreadForAgent: createThreadForAgentOverride,
                        toolHints,
                    });
                } catch (error) {
                    dispatch({ type: 'idle' });
                    throw error;
                }
                return undefined;
            }

            dispatch({
                type: 'picker',
                context,
                decision: result,
                optimisticContext,
                createThreadForAgent: createThreadForAgentOverride,
                prompt: message,
                toolHints,
            });
            const created = new Promise<void>((resolve, reject) => {
                heldSubmissionRef.current = { resolve, reject };
            });
            // Not every submitter waits for the pick.
            created.catch(() => undefined);
            return { created };
        },
        [agents, createAndCommitThread, onRouteError, projectUuid, routePrompt],
    );

    /** Resolves once the router has answered: a conversation, or the picker. */
    const handleSubmit = useCallback(
        async (args: AiAgentRouterSubmitArgs) => {
            await route(args);
        },
        [route],
    );

    /**
     * Resolves only once the conversation exists, also after a stop at the
     * picker, and rejects when it cannot be created or the pick is abandoned.
     * For a submitter that keeps the draft and its uploads until then.
     */
    const submitUntilCreated = useCallback(
        async (args: AiAgentRouterSubmitArgs) => {
            const held = await route(args);
            if (held) await held.created;
        },
        [route],
    );

    const confirmPick = useCallback(
        (agentUuid: string) => {
            if (phase.kind !== 'picker') return;
            // From here the creation request owns the outcome, not an unmount.
            const held = heldSubmissionRef.current;
            heldSubmissionRef.current = null;
            createAndCommitThread({
                agentUuid,
                context: phase.context,
                decisionUuid: phase.decision.decision.decisionUuid,
                message: phase.prompt,
                optimisticContext: phase.optimisticContext,
                createThreadForAgent: phase.createThreadForAgent,
                toolHints: phase.toolHints,
            }).then(
                () => held?.resolve(),
                (error: unknown) => {
                    // The draft is still in the composer; unlock it for a retry.
                    dispatch({ type: 'idle' });
                    held?.reject(error);
                },
            );
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
        submitUntilCreated,
    };
};
