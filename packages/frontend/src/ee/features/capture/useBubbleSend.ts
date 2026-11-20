import { FeatureFlags, type AiPromptContextInput } from '@lightdash/common';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';
import {
    isLauncherAutoAgent,
    LAUNCHER_AUTO_AGENT,
} from '../aiCopilot/components/Launcher/launcherAgentSelection';
import {
    useAiAgentLauncherRouter,
    type LauncherRouterCandidate,
} from '../aiCopilot/components/Launcher/useAiAgentLauncherRouter';
import { useDefaultAiAgent } from '../aiCopilot/components/Launcher/useDefaultAiAgent';
import { useCreateAgentThreadMutation } from '../aiCopilot/hooks/useProjectAiAgents';
import { uploadCaptureImages } from '../dashboardCapture/uploadCaptureImages';
import { type DesignSendResult } from './types';

export type BubbleSendInput = {
    bubbleId: string;
    /** The message, worded for whether the marked images go with it. */
    buildPrompt: (hasImages: boolean) => string;
    images: File[];
    context: AiPromptContextInput;
};

export type BubbleSendPicker = {
    bubbleId: string;
    candidates: LauncherRouterCandidate[];
    onPick: (agentUuid: string) => void;
    cancel: () => void;
};

// The one send that is waiting on the automatic agent choice.
type Waiting = {
    input: BubbleSendInput;
    /** An agent is chosen and the thread is being created: too late to cancel. */
    started: boolean;
    resolve: (result: DesignSendResult) => void;
    reject: (error: unknown) => void;
};

const NO_CONTEXT: [] = [];
const NEVER = new Promise<never>(() => {});

/**
 * Sends a Design Mode bubble as a new thread, to the agent the agent button
 * would use. Images upload only once the agent is known.
 */
export const useBubbleSend = (
    projectUuid: string,
): {
    send: (input: BubbleSendInput) => Promise<DesignSendResult>;
    picker: BubbleSendPicker | null;
} => {
    const lightdashApi = useLightdashApi();
    const imagesFlag = useServerFeatureFlag(FeatureFlags.AiThreadImages);
    const canSendImages = imagesFlag.data?.enabled === true;
    const { selectedAgent, agents } = useDefaultAiAgent(projectUuid);
    const { mutateAsync: createThread, isLoading: isCreatingThread } =
        useCreateAgentThreadMutation(projectUuid, { skipNavigation: true });

    const waitingRef = useRef<Waiting | null>(null);
    const [waitingBubbleId, setWaitingBubbleId] = useState<string | null>(null);

    const createFor = useCallback(
        async (input: BubbleSendInput, agentUuid: string) => {
            const fileUuids =
                canSendImages && input.images.length > 0
                    ? await uploadCaptureImages(lightdashApi, input.images)
                    : [];
            return createThread({
                agentUuid,
                prompt: input.buildPrompt(fileUuids.length > 0),
                context: [
                    ...input.context,
                    ...fileUuids.map((fileUuid) => ({
                        type: 'thread_image' as const,
                        fileUuid,
                    })),
                ],
            });
        },
        [canSendImages, createThread, lightdashApi],
    );

    const settle = useCallback(() => {
        waitingRef.current = null;
        setWaitingBubbleId(null);
    }, []);

    // Called by the router once it, or the user, has chosen the agent.
    const createThreadForAgent = useCallback(
        async ({ agentUuid }: { agentUuid: string }) => {
            const waiting = waitingRef.current;
            if (!waiting || waiting.started) return NEVER;
            waiting.started = true;
            try {
                const thread = await createFor(waiting.input, agentUuid);
                settle();
                waiting.resolve({
                    threadId: thread.uuid,
                    agentUuid: thread.agentUuid,
                });
                return thread;
            } catch (error) {
                settle();
                waiting.reject(error);
                // The router has no failure path after a pick, so it is left waiting.
                return NEVER;
            }
        },
        [createFor, settle],
    );

    const { confirmPick, handleSubmit, isPickingAgent, sortedCandidates } =
        useAiAgentLauncherRouter({
            agent: selectedAgent ?? LAUNCHER_AUTO_AGENT,
            agents,
            contextInput: NO_CONTEXT,
            createThreadForAgent,
            isCreatingThread,
            isPinnedContextReady: true,
            previewItems: NO_CONTEXT,
            projectUuid,
        });

    const send = useCallback(
        async (input: BubbleSendInput): Promise<DesignSendResult> => {
            if (!selectedAgent) throw new Error('No agent to send to');
            if (!isLauncherAutoAgent(selectedAgent)) {
                const thread = await createFor(input, selectedAgent.uuid);
                return { threadId: thread.uuid, agentUuid: thread.agentUuid };
            }
            if (waitingRef.current) {
                throw new Error('Another bubble is choosing its agent');
            }
            return new Promise<DesignSendResult>((resolve, reject) => {
                waitingRef.current = {
                    input,
                    started: false,
                    resolve,
                    reject,
                };
                setWaitingBubbleId(input.bubbleId);
                void handleSubmit({
                    message: input.buildPrompt(false),
                    toolHints: [],
                    context: input.context,
                });
            });
        },
        [createFor, handleSubmit, selectedAgent],
    );

    const cancel = useCallback(() => {
        const waiting = waitingRef.current;
        if (!waiting || waiting.started) return;
        settle();
        waiting.resolve('cancelled');
    }, [settle]);

    const onPick = useCallback(
        (agentUuid: string) => {
            if (waitingRef.current) confirmPick(agentUuid);
        },
        [confirmPick],
    );

    const picker = useMemo<BubbleSendPicker | null>(
        () =>
            waitingBubbleId !== null && isPickingAgent
                ? {
                      bubbleId: waitingBubbleId,
                      candidates: sortedCandidates,
                      onPick,
                      cancel,
                  }
                : null,
        [cancel, isPickingAgent, onPick, sortedCandidates, waitingBubbleId],
    );

    return { send, picker };
};
