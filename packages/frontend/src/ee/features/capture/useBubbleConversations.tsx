import { type AiPromptContextInput } from '@lightdash/common';
import { useCallback, useRef, type ReactNode } from 'react';
import BubbleReplyPoster, {
    type BubbleReplyPost,
} from '../aiCopilot/components/BubbleThread/BubbleReplyPoster';
import { BubbleThread } from '../aiCopilot/components/BubbleThread/BubbleThread';
import { LauncherAgentPicker } from '../aiCopilot/components/Launcher/LauncherAgentPicker';
import { buildDesignPrompt } from './buildDesignPrompt';
import {
    activeCollection,
    isInProgress,
    type Bubble,
    type BubbleInput,
    type DesignSession,
} from './designSession';
import { type DesignPayload, type DesignSendResult } from './types';
import { useBubbleSend, type BubbleSendPicker } from './useBubbleSend';

/** What a surface adds to a bubble's words and marks. */
export type BubbleMessage = {
    /** Opens a new conversation, saying what the page is. */
    heading: string;
    /** What the conversation is about: sent with its first message only. */
    about: AiPromptContextInput;
    /** What this message's marks are on: sent with every message. */
    marked: AiPromptContextInput;
};

type Design = {
    session: DesignSession;
    arm: (bubbleId: string, input: BubbleInput) => void;
    send: (bubbleId: string, typed: string) => void;
};

/**
 * The agent conversations behind Design Mode bubbles: a bubble's first send
 * opens a thread, later sends reply in it, and the bubble shows the agent
 * picker or the thread.
 */
export const useBubbleConversations = (
    projectUuid: string,
): {
    send: (
        payload: DesignPayload,
        message: BubbleMessage,
    ) => Promise<DesignSendResult>;
    /** The body of a bubble; `above` sits over a sent bubble's conversation. */
    renderBody: (
        bubble: Bubble,
        session: DesignSession,
        above: ReactNode,
    ) => ReactNode;
    picker: BubbleSendPicker | null;
    cancelSend: (bubbleId: string) => void;
    /** Call on every render with what useDesignMode returned. */
    attach: (design: Design) => void;
    /** Render once: keeps each sent bubble able to post a reply. */
    renderPosters: (session: DesignSession) => ReactNode;
} => {
    // Set through attach, once the hook that needs renderBody has run.
    const designRef = useRef<Design | null>(null);
    // How to reply in each sent bubble's conversation.
    const postersRef = useRef(new Map<string, BubbleReplyPost>());
    // What was mentioned in a reply's composer, kept until that reply is sent.
    const replyContextRef = useRef(new Map<string, AiPromptContextInput>());

    const {
        send: sendBubble,
        cancel: cancelSend,
        picker,
    } = useBubbleSend(projectUuid);

    const send = useCallback(
        async (
            payload: DesignPayload,
            message: BubbleMessage,
        ): Promise<DesignSendResult> => {
            const prompt = (surfaceHeading: string) => (hasImages: boolean) =>
                buildDesignPrompt({
                    surfaceHeading,
                    summary: payload.summary,
                    typed: payload.typed,
                    hasImages,
                });

            const bubble = designRef.current?.session.bubbles.find(
                (b) => b.id === payload.bubbleId,
            );
            if (bubble?.threadId && bubble.agentUuid) {
                // A reply: the conversation already knows what it is about.
                const post = postersRef.current.get(bubble.id);
                if (!post) throw new Error('The conversation is not open');
                const mentioned = replyContextRef.current.get(bubble.id) ?? [];
                replyContextRef.current.delete(bubble.id);
                await post({
                    buildPrompt: prompt(''),
                    images: payload.images,
                    context: [...mentioned, ...message.marked],
                });
                return {
                    threadId: bubble.threadId,
                    agentUuid: bubble.agentUuid,
                };
            }

            return sendBubble({
                bubbleId: payload.bubbleId,
                buildPrompt: prompt(message.heading),
                images: payload.images,
                context: [...message.about, ...message.marked],
            });
        },
        [sendBubble],
    );

    const renderBody = (
        bubble: Bubble,
        session: DesignSession,
        above: ReactNode,
    ): ReactNode => {
        if (bubble.status === 'picking-agent') {
            return picker?.bubbleId === bubble.id ? (
                <LauncherAgentPicker
                    candidates={picker.candidates}
                    onPick={picker.onPick}
                    waitingPrompt={null}
                />
            ) : null;
        }
        const { threadId, agentUuid } = bubble;
        if (bubble.status !== 'thread' || !threadId || !agentUuid) return null;

        const active = activeCollection(session);
        const armed =
            session.active.kind === 'bubble' &&
            session.active.bubbleId === bubble.id;
        const collecting =
            active !== null &&
            (active.bubble.input === 'mic' || isInProgress(active.collection));

        return (
            <>
                {above}
                <BubbleThread
                    projectUuid={projectUuid}
                    agentUuid={agentUuid}
                    threadId={threadId}
                    armed={armed}
                    onArm={(input) => designRef.current?.arm(bubble.id, input)}
                    replyCollecting={collecting}
                    onSendReply={(prompt, context) => {
                        replyContextRef.current.set(bubble.id, context);
                        designRef.current?.send(bubble.id, prompt);
                        return Promise.resolve();
                    }}
                    // The bubble draws its own close button.
                    onClose={null}
                />
            </>
        );
    };

    const registerPoster = useCallback(
        (bubbleId: string, post: BubbleReplyPost | null) => {
            if (post) postersRef.current.set(bubbleId, post);
            else postersRef.current.delete(bubbleId);
        },
        [],
    );

    const renderPosters = (session: DesignSession): ReactNode =>
        session.bubbles.map((bubble) =>
            bubble.threadId && bubble.agentUuid ? (
                <BubbleReplyPoster
                    key={bubble.id}
                    projectUuid={projectUuid}
                    agentUuid={bubble.agentUuid}
                    threadId={bubble.threadId}
                    bubbleId={bubble.id}
                    register={registerPoster}
                />
            ) : null,
        );

    const attach = (design: Design) => {
        designRef.current = design;
    };

    return { send, renderBody, picker, cancelSend, attach, renderPosters };
};
