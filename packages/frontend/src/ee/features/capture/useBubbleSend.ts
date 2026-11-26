import { FeatureFlags } from '@lightdash/common';
import { useCallback, useMemo, useRef, useState } from 'react';
import useToaster from '../../../hooks/toaster/useToaster';
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
import { type DesignSendResult } from './types';
import { withThreadImages, type MarkedMessage } from './withThreadImages';

export type BubbleSendInput = MarkedMessage & { bubbleId: string };

export type BubbleSendPicker = {
    bubbleId: string;
    candidates: LauncherRouterCandidate[];
    onPick: (agentUuid: string) => void;
    cancel: () => void;
};

// The one send that is waiting on the automatic agent choice.
type Waiting = {
    input: BubbleSendInput;
    /** The router has been asked; until then its answers belong to an older send. */
    submitted: boolean;
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
    /** Calls off a send still waiting on the agent choice: it resolves 'cancelled'. */
    cancel: (bubbleId: string) => void;
    picker: BubbleSendPicker | null;
} => {
    const lightdashApi = useLightdashApi();
    const { showToastWarning } = useToaster();
    const imagesFlag = useServerFeatureFlag(FeatureFlags.AiThreadImages);
    const canSendImages = imagesFlag.data?.enabled === true;
    const { selectedAgent, agents } = useDefaultAiAgent(projectUuid);
    const { mutateAsync: createThread, isLoading: isCreatingThread } =
        useCreateAgentThreadMutation(projectUuid, {
            skipNavigation: true,
            // The caller reports a failed send; no second toast, no redirect.
            silentErrors: true,
        });

    const waitingRef = useRef<Waiting | null>(null);
    // The router's answer to the latest send it was asked about, and how to mark it in.
    const routedRef = useRef<Promise<void> | null>(null);
    const routedDoneRef = useRef<() => void>(() => {});
    const [waitingBubbleId, setWaitingBubbleId] = useState<string | null>(null);

    const createFor = useCallback(
        async (input: BubbleSendInput, agentUuid: string) => {
            const { prompt, context, imagesDropped } = await withThreadImages(
                lightdashApi,
                canSendImages,
                input,
            );
            if (imagesDropped) {
                showToastWarning({
                    title: 'The screenshot could not be attached',
                    subtitle:
                        'The agent got your words without the marked picture.',
                });
            }
            return createThread({ agentUuid, prompt, context });
        },
        [canSendImages, createThread, lightdashApi, showToastWarning],
    );

    const settle = useCallback(() => {
        waitingRef.current = null;
        setWaitingBubbleId(null);
    }, []);

    // Called by the router once it, or the user, has chosen the agent.
    const createThreadForAgent = useCallback(
        async ({ agentUuid }: { agentUuid: string }) => {
            routedDoneRef.current();
            const waiting = waitingRef.current;
            // Cancelled, or an answer to an older send: nothing to create.
            if (!waiting || !waiting.submitted || waiting.started) return NEVER;
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

    const handleSubmitRef = useRef(handleSubmit);
    handleSubmitRef.current = handleSubmit;

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
                const waiting: Waiting = {
                    input,
                    submitted: false,
                    started: false,
                    resolve,
                    reject,
                };
                waitingRef.current = waiting;
                const submit = () => {
                    if (waitingRef.current !== waiting) return;
                    waiting.submitted = true;
                    let done = () => {};
                    const routed = new Promise<void>((answered) => {
                        done = () => {
                            if (routedRef.current === routed) {
                                routedRef.current = null;
                            }
                            answered();
                        };
                    });
                    routedRef.current = routed;
                    routedDoneRef.current = done;
                    setWaitingBubbleId(input.bubbleId);
                    void handleSubmitRef
                        .current({
                            message: input.buildPrompt(false),
                            toolHints: [],
                            context: input.context,
                        })
                        .finally(done);
                };
                // A cancelled send's route may still be out: let it land first.
                const previous = routedRef.current;
                if (previous) void previous.then(submit);
                else submit();
            });
        },
        [createFor, selectedAgent],
    );

    const cancel = useCallback(
        (bubbleId: string) => {
            const waiting = waitingRef.current;
            if (!waiting || waiting.started) return;
            if (waiting.input.bubbleId !== bubbleId) return;
            settle();
            waiting.resolve('cancelled');
        },
        [settle],
    );

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
                      cancel: () => cancel(waitingBubbleId),
                  }
                : null,
        [cancel, isPickingAgent, onPick, sortedCandidates, waitingBubbleId],
    );

    return { send, cancel, picker };
};
