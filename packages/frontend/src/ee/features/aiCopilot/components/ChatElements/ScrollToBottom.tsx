import { rem } from '@mantine-8/core';
import { useCallback, useLayoutEffect, useRef } from 'react';
import { useParams } from 'react-router';
import { useAiAgentThread } from '../../hooks/useOrganizationAiAgents';
import { useAiAgentThreadStreamQuery } from '../../streaming/useAiAgentThreadStreamQuery';

const SCROLL_TO_BOTTOM_THRESHOLD = 200;

type ScrollToBottomOptions = {
    behavior?: 'auto' | 'smooth';
    checkCurrentScrollPosition?: boolean;
};

function useAutoScroll(scrollAreaRef: React.RefObject<HTMLDivElement | null>) {
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = useCallback(
        ({
            behavior = 'smooth',
            checkCurrentScrollPosition = false,
        }: ScrollToBottomOptions = {}) => {
            if (checkCurrentScrollPosition) {
                if (!scrollAreaRef.current) return;
                const nearBottom =
                    scrollAreaRef.current?.scrollHeight -
                        scrollAreaRef.current?.scrollTop -
                        scrollAreaRef.current?.clientHeight <
                    SCROLL_TO_BOTTOM_THRESHOLD;

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
    const { agentUuid, threadUuid } = useParams();
    if (!agentUuid || !threadUuid)
        throw new Error('Agent and thread UUIDs are required');

    const streamingState = useAiAgentThreadStreamQuery(threadUuid);
    const thread = useAiAgentThread(agentUuid, threadUuid);

    const { messagesEndRef, scrollToBottom } = useAutoScroll(scrollAreaRef);

    // Scroll to bottom when the thread is loaded/switched
    useLayoutEffect(() => {
        scrollToBottom();
    }, [thread.data?.messages.length, threadUuid, scrollToBottom]);

    // Scroll to bottom when the thread is streaming, if user has manually scrolled up do not autoscroll
    useLayoutEffect(() => {
        return scrollToBottom({
            checkCurrentScrollPosition: true,
            behavior: 'auto',
        });
    }, [
        streamingState?.content,
        streamingState?.toolCalls?.length,
        scrollToBottom,
    ]);

    return (
        <div
            ref={messagesEndRef}
            data-testid="thread-scroll-to-bottom"
            style={{ marginTop: rem(-30) }}
        />
    );
};

export default ThreadScrollToBottom;
