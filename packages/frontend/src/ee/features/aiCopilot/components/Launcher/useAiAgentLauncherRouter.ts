import {
    type AiAgentSummary,
    type AiPromptContext,
    type AiPromptContextInput,
} from '@lightdash/common';
import { useCallback } from 'react';
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
        sortedCandidates,
    } = useAiAgentRouterFlow({
        agents,
        createThreadForAgent,
        onRouteError: ({ fallbackAgent, ...args }) => {
            if (fallbackAgent) {
                void createThreadForAgent({
                    ...args,
                    agentUuid: fallbackAgent.uuid,
                });
            }
        },
        projectUuid,
    });

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
                void createThreadForAgent({
                    agentUuid: agent.uuid,
                    message,
                    context: mergedContext,
                    optimisticContext: mergedOptimisticContext,
                    toolHints,
                });
                return;
            }

            void handleRouterSubmit({
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
            handleRouterSubmit,
            isPinnedContextReady,
            previewItems,
        ],
    );

    return {
        confirmPick,
        handleSubmit,
        isLocked: isCreatingThread || isLocked,
        isPickingAgent,
        isRouting,
        sortedCandidates,
    };
};
