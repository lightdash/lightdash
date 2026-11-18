import { type AiPromptContextInput } from '@lightdash/common';
import { useCallback, useRef } from 'react';
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
import {
    captureThreadTarget,
    screenshotsFitInThread,
} from './captureThreadTarget';
import { uploadCaptureImages } from './uploadCaptureImages';

/** Shown when a recording could not join the open conversation. */
export const FULL_CONVERSATION_NOTE =
    'The open conversation is full of screenshots, so this started a new one.';

type SendInput = {
    /** The agent for a new thread. A continued thread keeps its own agent. */
    agentUuid: string;
    /** Builds the prompt; told whether any screenshots made it in. */
    buildPrompt: (hasImages: boolean) => string;
    context: AiPromptContextInput;
    /** Marked-up screenshots as base64 JPEG. */
    images: string[];
};

type SendResult = {
    /** Whether the recording joined the open conversation or started one. */
    outcome: 'continued' | 'new' | 'new-because-full';
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
    // Screenshots this page has put in each conversation, against its limit.
    const imagesSentRef = useRef(new Map<string, number>());

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
        }: SendInput): Promise<SendResult> => {
            const imageUuids = await uploadCaptureImages(images);
            const fullContext: AiPromptContextInput = [
                ...context,
                ...imageUuids.map((fileUuid) => ({
                    type: 'thread_image' as const,
                    fileUuid,
                })),
            ];
            const prompt = buildPrompt(imageUuids.length > 0);
            const startNew = async () => {
                const thread = await createThread({
                    agentUuid,
                    prompt,
                    context: fullContext,
                });
                imagesSentRef.current.set(thread.uuid, imageUuids.length);
            };

            const threadId = openThreadId;
            if (!threadId || !openAgentUuid) {
                await startNew();
                return { outcome: 'new' };
            }
            const already = imagesSentRef.current.get(threadId) ?? 0;
            // A full conversation would drop screenshots, so start afresh.
            if (!screenshotsFitInThread(already, imageUuids.length)) {
                await startNew();
                return { outcome: 'new-because-full' };
            }
            try {
                await sendMessage({ prompt, context: fullContext });
            } catch {
                // Refused (for example, full of screenshots attached by hand).
                await startNew();
                return { outcome: 'new-because-full' };
            }
            imagesSentRef.current.set(threadId, already + imageUuids.length);
            return { outcome: 'continued' };
        },
        [createThread, openAgentUuid, openThreadId, sendMessage],
    );
};
