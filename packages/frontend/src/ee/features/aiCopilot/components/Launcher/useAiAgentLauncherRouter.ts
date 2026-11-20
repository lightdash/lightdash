import {
    type AiAgentSummary,
    type AiPromptContext,
    type AiPromptContextInput,
} from '@lightdash/common';
import { useCallback, useMemo } from 'react';
import {
    useAiAgentRouterFlow,
    type AiAgentRouterCandidate,
} from '../../hooks/useAiAgentRouterFlow';
import {
    mergeAiPromptContextInput,
    mergeAiPromptContextItems,
} from '../ChatElements/contentMentions';
import {
    isLauncherAutoAgent,
    type LauncherSelectedAgent,
} from './launcherAgentSelection';

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

export type LauncherRouterCandidate = AiAgentRouterCandidate;

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
    const {
        confirmPick,
        handleSubmit: handleRouterSubmit,
        isLocked,
        isPickingAgent,
        isRouting,
        phase,
        sortedCandidates,
        submitUntilCreated: submitToRouterUntilCreated,
    } = useAiAgentRouterFlow({
        agents,
        createThreadForAgent,
        onRouteError: async ({ fallbackAgent, ...args }) => {
            if (fallbackAgent) {
                await createThreadForAgent({
                    ...args,
                    agentUuid: fallbackAgent.uuid,
                });
            }
        },
        projectUuid,
    });

    const submitWith = useCallback(
        (submitToRouter: typeof handleRouterSubmit) =>
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
                    return createThreadForAgent({
                        agentUuid: agent.uuid,
                        message,
                        context: mergedContext,
                        optimisticContext: mergedOptimisticContext,
                        toolHints,
                    });
                }

                return submitToRouter({
                    message,
                    context: mergedContext,
                    optimisticContext: mergedOptimisticContext,
                    toolHints,
                });
            },
        [
            agent,
            contextInput,
            createThreadForAgent,
            isPinnedContextReady,
            previewItems,
        ],
    );
    // With Auto this resolves once the router has answered, also at the picker.
    const handleSubmit = useMemo(
        () => submitWith(handleRouterSubmit),
        [handleRouterSubmit, submitWith],
    );
    // With Auto this resolves only once the conversation exists: for a
    // composer that keeps the draft and its uploads until then.
    const submitUntilCreated = useMemo(
        () => submitWith(submitToRouterUntilCreated),
        [submitToRouterUntilCreated, submitWith],
    );

    return {
        confirmPick,
        handleSubmit,
        submitUntilCreated,
        isLocked: isCreatingThread || isLocked,
        isPickingAgent,
        isRouting,
        // The message held back until the user picks an agent.
        waitingPrompt: phase.kind === 'picker' ? phase.prompt : null,
        waitingImages:
            phase.kind === 'picker'
                ? (phase.optimisticContext ?? []).filter(
                      (item) => item.type === 'thread_image',
                  )
                : [],
        sortedCandidates,
    };
};
