import { rem } from '@mantine-8/core';
import { useCallback, useLayoutEffect, useRef } from 'react';
import { useParams } from 'react-router';
import { useAiAgentThread } from '../../hooks/useProjectAiAgents';
import { useAiAgentThreadStreamQuery } from '../../streaming/useAiAgentThreadStreamQuery';

const SCROLL_TO_BOTTOM_THRESHOLD = {
    streaming: 200,
    chart: 500,
};

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
                    SCROLL_TO_BOTTOM_THRESHOLD[type];

                if (!nearBottom) return;
            }

            const node = messagesEndRef.current;
            if (!node) return;
            let frame = requestAnimationFrame(() => {
                node.scrollIntoView({ behavior });
            });
            return () => cancelAnimationFrame(frame);
        },
        [scrollAreaRef],
    );

    return { messagesEndRef, scrollToBottom };
}

const ThreadScrollToBottom = ({
    scrollAreaRef,
}: {
    scrollAreaRef: React.RefObject<HTMLDivElement | null>;
}) => {
    const { agentUuid, threadUuid, projectUuid } = useParams();
    if (!agentUuid || !threadUuid || !projectUuid)
        throw new Error('Agent, thread and project UUIDs are required');

    const streamingState = useAiAgentThreadStreamQuery(threadUuid);
    const thread = useAiAgentThread(projectUuid, agentUuid, threadUuid);

    const { messagesEndRef, scrollToBottom } = useAutoScroll(scrollAreaRef);

    // Scroll to bottom when the thread is loaded/switched
    useLayoutEffect(() => {
        return scrollToBottom();
    }, [thread.data?.messages.length, threadUuid, scrollToBottom]);

    // Scroll to bottom when the thread is streaming, if user has manually scrolled up do not autoscroll
    const totalReasoningPartsCount = streamingState?.reasoning?.flatMap(
        (r) => r.parts,
    ).length;

    useLayoutEffect(() => {
        return scrollToBottom({
            checkCurrentScrollPosition: true,
            behavior: 'auto',
        });
    }, [
        streamingState?.content,
        streamingState?.toolCalls?.length,
        totalReasoningPartsCount,
        streamingState?.error,
        scrollToBottom,
    ]);

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
