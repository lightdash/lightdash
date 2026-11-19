import { type AiPromptContextInput } from '@lightdash/common';
import { useCallback } from 'react';
import { useLauncherDock } from '../aiCopilot/components/Launcher/useLauncherDock';
import {
    useCreateAgentThreadMessageMutation,
    useCreateAgentThreadMutation,
} from '../aiCopilot/hooks/useProjectAiAgents';
import { openPanel } from '../aiCopilot/store/aiAgentLauncherSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../aiCopilot/store/hooks';
import { captureThreadTarget } from './captureThreadTarget';

type SendInput = {
    /** The agent for a new thread. A continued thread keeps its own agent. */
    agentUuid: string;
    prompt: string;
    context: AiPromptContextInput;
};

/**
 * Sends a Voice Design recording to the agent as text. If a conversation is open in the
 * agent panel, the recording continues it; otherwise it starts a new one and
 * opens it.
 */
export const useSendCaptureToAgent = (projectUuid: string) => {
    const dispatch = useAiAgentStoreDispatch();
    const { addItem: addDockItem } = useLauncherDock(projectUuid);
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

    return useCallback(
        async ({ agentUuid, prompt, context }: SendInput): Promise<void> => {
            if (openThreadId && openAgentUuid) {
                await sendMessage({ prompt, context });
                return;
            }
            await createThread({ agentUuid, prompt, context });
        },
        [createThread, openAgentUuid, openThreadId, sendMessage],
    );
};
