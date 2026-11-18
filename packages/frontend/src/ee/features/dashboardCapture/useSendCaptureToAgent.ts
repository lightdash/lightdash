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
import { uploadCaptureImages } from './uploadCaptureImages';

type SendInput = {
    /** The agent for a new thread. A continued thread keeps its own agent. */
    agentUuid: string;
    /** Builds the prompt; told whether any screenshots made it in. */
    buildPrompt: (hasImages: boolean) => string;
    context: AiPromptContextInput;
    /** Marked-up screenshots as base64 JPEG. */
    images: string[];
};

/**
 * Sends an Inline recording to the agent. If a conversation is open in the
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
        async ({
            agentUuid,
            buildPrompt,
            context,
            images,
        }: SendInput): Promise<void> => {
            const imageUuids = await uploadCaptureImages(images);
            const fullContext: AiPromptContextInput = [
                ...context,
                ...imageUuids.map((fileUuid) => ({
                    type: 'thread_image' as const,
                    fileUuid,
                })),
            ];
            const prompt = buildPrompt(imageUuids.length > 0);
            if (openThreadId && openAgentUuid) {
                await sendMessage({ prompt, context: fullContext });
                return;
            }
            await createThread({ agentUuid, prompt, context: fullContext });
        },
        [createThread, openAgentUuid, openThreadId, sendMessage],
    );
};
