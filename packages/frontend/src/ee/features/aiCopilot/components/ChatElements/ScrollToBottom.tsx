import { rem } from '@mantine/core';
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';
import { useSearchParams } from 'react-router';
import { CHAT_MESSAGE_PARAM, findChatAnchor } from '../../hooks/useChatBackUrl';
import { useAiAgentThread } from '../../hooks/useProjectAiAgents';
import { useAiAgentThreadStreamQuery } from '../../streaming/useAiAgentThreadStreamQuery';

const SCROLL_TO_BOTTOM_THRESHOLD = {
    streaming: 200,
    chart: 500,
};
// Short panels, like small embed iframes, use a smaller threshold.
const MAX_THRESHOLD_VIEWPORT_RATIO = 0.2;

type ScrollToBottomOptions = {
    behavior?: 'auto' | 'smooth';
    checkCurrentScrollPosition?: boolean;
    type?: 'streaming' | 'chart';
};

function useAutoScroll(scrollAreaRef: React.RefObject<HTMLDivElement | null>) {
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = useCallback(
        ({
            behavior = 'smooth',
            checkCurrentScrollPosition = false,
            type = 'streaming',
        }: ScrollToBottomOptions = {}) => {
            if (checkCurrentScrollPosition) {
                if (!scrollAreaRef.current) return;
                const nearBottom =
                    scrollAreaRef.current?.scrollHeight -
                        scrollAreaRef.current?.scrollTop -
                        scrollAreaRef.current?.clientHeight <
                    Math.min(
                        SCROLL_TO_BOTTOM_THRESHOLD[type],
                        scrollAreaRef.current.clientHeight *
                            MAX_THRESHOLD_VIEWPORT_RATIO,
                    );

                if (!nearBottom) return;
            }

            const viewport = scrollAreaRef.current;
            if (!viewport) return;
            // Scroll only the chat viewport, never its ancestors: the agent can be
            // embedded in a host page whose own scroll must not move
            let frame = requestAnimationFrame(() => {
                viewport.scrollTo({ top: viewport.scrollHeight, behavior });
            });
            return () => cancelAnimationFrame(frame);
        },
        [scrollAreaRef],
    );

    return { messagesEndRef, scrollToBottom };
}

const ThreadScrollToBottom = ({
    scrollAreaRef,
    projectUuid,
    agentUuid,
    threadUuid,
}: {
    scrollAreaRef: React.RefObject<HTMLDivElement | null>;
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
}) => {
    const streamingState = useAiAgentThreadStreamQuery(threadUuid);
    const thread = useAiAgentThread(projectUuid, agentUuid, threadUuid);

    const { messagesEndRef, scrollToBottom } = useAutoScroll(scrollAreaRef);

    // Return to where the viewer left the thread, else scroll to bottom when
    // the thread is loaded/switched
    const [searchParams, setSearchParams] = useSearchParams();
    const [returnMessageId] = useState(() =>
        searchParams.get(CHAT_MESSAGE_PARAM),
    );
    const hasPositioned = useRef(false);
    useLayoutEffect(() => {
        if (!hasPositioned.current && returnMessageId !== null) {
            const frame = requestAnimationFrame(() => {
                hasPositioned.current = true;
                const viewport = scrollAreaRef.current;
                if (!viewport) return;
                const anchor = findChatAnchor(viewport, returnMessageId);
                if (!anchor) {
                    viewport.scrollTop = viewport.scrollHeight;
                    return;
                }
                const anchorRect = anchor.getBoundingClientRect();
                // Centre the element; one taller than the panel aligns to the top.
                const centreOffset = Math.max(
                    0,
                    (viewport.clientHeight - anchorRect.height) / 2,
                );
                viewport.scrollTop +=
                    anchorRect.top -
                    viewport.getBoundingClientRect().top -
                    centreOffset;
            });
            return () => cancelAnimationFrame(frame);
        }
        hasPositioned.current = true;
        return scrollToBottom();
    }, [
        thread.data?.messages.length,
        threadUuid,
        returnMessageId,
        scrollAreaRef,
        scrollToBottom,
    ]);

    useEffect(() => {
        if (!searchParams.has(CHAT_MESSAGE_PARAM)) return;
        setSearchParams(
            (params) => {
                params.delete(CHAT_MESSAGE_PARAM);
                return params;
            },
            { replace: true },
        );
    }, [searchParams, setSearchParams]);

    // Scroll to bottom when the thread is streaming, if user has manually scrolled up do not autoscroll
    const totalReasoningPartsCount = streamingState?.reasoning?.flatMap(
        (r) => r.parts,
    ).length;
    const totalReasoningTextLength = streamingState?.reasoning?.reduce(
        (sum, r) => sum + r.parts.reduce((acc, part) => acc + part.length, 0),
        0,
    );
    const streamingError =
        streamingState?.connection.status === 'error'
            ? streamingState.connection.error
            : undefined;

    useLayoutEffect(() => {
        return scrollToBottom({
            checkCurrentScrollPosition: true,
            behavior: 'auto',
        });
    }, [
        streamingState?.content,
        streamingState?.toolCalls?.length,
        totalReasoningPartsCount,
        totalReasoningTextLength,
        streamingError,
        scrollToBottom,
    ]);

    // When streaming ends the rolling preview is replaced by the full
    // streamdown answer, which is taller. The layout shift fires after this
    // effect runs, so we schedule one more scroll on the next frame and then
    // again after Streamdown's animations settle (~360ms).
    const isStreaming = streamingState?.connection.status === 'streaming';
    useEffect(() => {
        if (isStreaming !== false) return;
        const raf = requestAnimationFrame(() => {
            scrollToBottom({
                checkCurrentScrollPosition: true,
                behavior: 'auto',
            });
        });
        const timeout = window.setTimeout(() => {
            scrollToBottom({
                checkCurrentScrollPosition: true,
                behavior: 'smooth',
            });
        }, 360);
        return () => {
            cancelAnimationFrame(raf);
            window.clearTimeout(timeout);
        };
    }, [isStreaming, scrollToBottom]);

    // Scroll to bottom when the last message gets a chart visualization
    const lastMessage = thread.data?.messages?.at(-1);
    const lastMessageViz =
        lastMessage?.role === 'assistant' &&
        lastMessage?.artifacts &&
        lastMessage.artifacts.length > 0;

    useLayoutEffect(() => {
        if (!lastMessageViz) return;
        return scrollToBottom({
            checkCurrentScrollPosition: true,
            behavior: 'auto',
            type: 'chart',
        });
    }, [lastMessageViz, scrollToBottom]);

    return (
        <div
            ref={messagesEndRef}
            data-testid="thread-scroll-to-bottom"
            style={{ marginTop: rem(-30) }}
        />
    );
};

export default ThreadScrollToBottom;
