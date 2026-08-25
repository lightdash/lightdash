import {
    type AiAgentSummary,
    type AiPromptContext,
    type AiPromptContextInput,
} from '@lightdash/common';
import { useCallback } from 'react';
import { type StartDeepResearchArgs } from '../../deepResearch/types';
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

type LauncherRouterPayload = { kind: 'chat' } | { kind: 'deep_research' };

export type LauncherRouterCandidate = AiAgentRouterCandidate;

export const useAiAgentLauncherRouter = ({
    agent,
    agents,
    contextInput,
    createDeepResearchForAgent,
    createThreadForAgent,
    isCreatingThread,
    isPinnedContextReady,
    previewItems,
    projectUuid,
}: {
    agent: NonNullable<LauncherSelectedAgent>;
    agents: AiAgentSummary[];
    contextInput: AiPromptContextInput;
    createDeepResearchForAgent: CreateThreadForAgent;
    createThreadForAgent: CreateThreadForAgent;
    isCreatingThread: boolean;
    isPinnedContextReady: boolean;
    previewItems: AiPromptContext;
    projectUuid: string;
}) => {
    const createThreadForPayload = useCallback(
        ({
            payload,
            ...args
        }: Parameters<CreateThreadForAgent>[0] & {
            payload: LauncherRouterPayload;
        }) =>
            payload.kind === 'deep_research'
                ? createDeepResearchForAgent(args)
                : createThreadForAgent(args),
        [createDeepResearchForAgent, createThreadForAgent],
    );

    const {
        confirmPick,
        handleSubmit: handleRouterSubmit,
        isLocked,
        isPickingAgent,
        isRouting,
        sortedCandidates,
    } = useAiAgentRouterFlow<LauncherRouterPayload>({
        agents,
        createThreadForAgent: createThreadForPayload,
        onRouteError: async ({ fallbackAgent, payload, ...args }) => {
            if (fallbackAgent) {
                await createThreadForPayload({
                    ...args,
                    agentUuid: fallbackAgent.uuid,
                    payload,
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
                payload: { kind: 'chat' },
                toolHints,
            }).catch(() => undefined);
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

    const handleStartDeepResearch = useCallback(
        async ({ question }: StartDeepResearchArgs) => {
            if (!isPinnedContextReady) {
                return;
            }

            const args = {
                context: contextInput,
                message: question,
                optimisticContext: previewItems,
                toolHints: [],
            };

            if (!isLauncherAutoAgent(agent)) {
                await createDeepResearchForAgent({
                    ...args,
                    agentUuid: agent.uuid,
                });
                return;
            }

            await handleRouterSubmit({
                ...args,
                payload: { kind: 'deep_research' },
            });
        },
        [
            agent,
            contextInput,
            createDeepResearchForAgent,
            handleRouterSubmit,
            isPinnedContextReady,
            previewItems,
        ],
    );

    return {
        confirmPick,
        handleStartDeepResearch,
        handleSubmit,
        isLocked: isCreatingThread || isLocked,
        isPickingAgent,
        isRouting,
        sortedCandidates,
    };
};
