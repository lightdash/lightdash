import {
    assertUnreachable,
    FeatureFlags,
    type AiPromptContextInput,
} from '@lightdash/common';
import { useCallback } from 'react';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';
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
import { uploadCaptureImages } from './uploadCaptureImages';

type SendInput = {
    /** The message, worded for whether the marked screenshots go with it. */
    buildPrompt: (hasImages: boolean) => string;
    /** The recording's screenshots with the marks drawn on. */
    images: File[];
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
    const lightdashApi = useLightdashApi();
    const imagesFlag = useServerFeatureFlag(FeatureFlags.AiThreadImages);
    const canSendImages = imagesFlag.data?.enabled === true;
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
        async ({
            buildPrompt,
            images,
            context: pageContext,
            followUp,
        }: SendInput): Promise<void> => {
            // Like a screen recording: the agent sees the marks as drawn.
            const imageFileUuids =
                canSendImages && images.length > 0
                    ? await uploadCaptureImages(lightdashApi, images)
                    : [];
            const prompt = buildPrompt(imageFileUuids.length > 0);
            const context: AiPromptContextInput = [
                ...pageContext,
                ...imageFileUuids.map((fileUuid) => ({
                    type: 'thread_image' as const,
                    fileUuid,
                })),
            ];
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
                            pendingContext: toPendingContext(pageContext),
                            pendingPrompt: prompt,
                            pendingImageFileUuids: imageFileUuids,
                        }),
                    );
                    return;
                default:
                    assertUnreachable(plan, 'Unknown capture send plan');
            }
        },
        [
            canSendImages,
            createThread,
            dispatch,
            lightdashApi,
            openAgentUuid,
            openThreadId,
            selectedAgent,
            sendMessage,
        ],
    );

    return { send };
};
