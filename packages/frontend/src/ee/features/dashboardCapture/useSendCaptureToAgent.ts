import {
    assertUnreachable,
    type AiPromptContextInput,
} from '@lightdash/common';
import { useCallback } from 'react';
import { useDefaultAiAgent } from '../aiCopilot/components/Launcher/useDefaultAiAgent';
import { useLauncherDock } from '../aiCopilot/components/Launcher/useLauncherDock';
import {
    useCreateAgentThreadMessageMutation,
    useCreateAgentThreadMutation,
} from '../aiCopilot/hooks/useProjectAiAgents';
import {
    openDefaultAgentPanel,
    openPanel,
} from '../aiCopilot/store/aiAgentLauncherSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../aiCopilot/store/hooks';
import { captureSendPlan, toPendingContext } from './captureSendPlan';
import { captureThreadTarget } from './captureThreadTarget';

type SendInput = {
    prompt: string;
    context: AiPromptContextInput;
    /** Started from the open conversation's mic: add to that conversation. */
    followUp: boolean;
};

/**
 * Sends a Voice Design recording to the agent as text, to the agent the agent
 * button would use (see captureSendPlan).
 */
export const useSendCaptureToAgent = (projectUuid: string) => {
    const dispatch = useAiAgentStoreDispatch();
    const { addItem: addDockItem } = useLauncherDock(projectUuid);
    const { selectedAgent } = useDefaultAiAgent(projectUuid);
    const openThreadId = useAiAgentStoreSelector(
        (state) => captureThreadTarget(state.aiAgentLauncher)?.threadId ?? null,
    );
    const openAgentUuid = useAiAgentStoreSelector(
        (state) =>
            captureThreadTarget(state.aiAgentLauncher)?.agentUuid ?? null,
    );

    const { mutateAsync: createThread } = useCreateAgentThreadMutation(
        projectUuid,
        {
            skipNavigation: true,
            onCreated: (thread) => {
                addDockItem({
                    threadId: thread.uuid,
                    agentUuid: thread.agentUuid,
                    title: thread.firstMessage.message,
                });
                dispatch(
                    openPanel({
                        threadId: thread.uuid,
                        agentUuid: thread.agentUuid,
                    }),
                );
            },
        },
    );
    const { mutateAsync: sendMessage } = useCreateAgentThreadMessageMutation(
        projectUuid,
        openAgentUuid ?? undefined,
        openThreadId ?? undefined,
    );

    const send = useCallback(
        async ({ prompt, context, followUp }: SendInput): Promise<void> => {
            const plan = captureSendPlan({
                followUp,
                openThread:
                    openThreadId && openAgentUuid
                        ? { threadId: openThreadId, agentUuid: openAgentUuid }
                        : null,
                selectedAgent,
            });
            switch (plan.type) {
                case 'continue':
                    await sendMessage({ prompt, context });
                    return;
                case 'create':
                    await createThread({
                        agentUuid: plan.agentUuid,
                        prompt,
                        context,
                    });
                    return;
                case 'panel':
                    dispatch(
                        openDefaultAgentPanel({
                            pendingContext: toPendingContext(context),
                            pendingPrompt: prompt,
                        }),
                    );
                    return;
                default:
                    assertUnreachable(plan, 'Unknown capture send plan');
            }
        },
        [
            createThread,
            dispatch,
            openAgentUuid,
            openThreadId,
            selectedAgent,
            sendMessage,
        ],
    );

    return { send };
};
