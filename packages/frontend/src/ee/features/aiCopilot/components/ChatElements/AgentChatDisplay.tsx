import { type AiAgentMessage, type AiAgentThread } from '@lightdash/common';
import { Divider, ScrollArea, Stack } from '@mantine-8/core';
import { Fragment, useLayoutEffect, useRef, type FC } from 'react';
import ErrorBoundary from '../../../../../features/errorBoundary/ErrorBoundary';
import { AssistantBubble, UserBubble } from './AgentChatBubbles';
import { ChatElementsUtils } from './utils';

type AiThreadMessageProps = {
    message: AiAgentMessage;
    agentName?: string;
    isPreview?: boolean;
};

const AiThreadMessage: FC<AiThreadMessageProps> = ({
    message,
    isPreview = false,
}) => {
    const isUser = message.role === 'user';

    return isUser ? (
        <UserBubble message={message} />
    ) : (
        <ErrorBoundary>
            <AssistantBubble message={message} isPreview={isPreview} />
        </ErrorBoundary>
    );
};

type AgentChatDisplayProps = {
    thread: AiAgentThread;
    agentName?: string;
    height?: string | number;
    showScrollbar?: boolean;
    enableAutoScroll?: boolean;
    padding?: string;
    isGenerating?: boolean;
    isPreview?: boolean;
};

export const AgentChatDisplay: FC<AgentChatDisplayProps> = ({
    thread,
    agentName = 'AI',
    height = '100%',
    showScrollbar = true,
    enableAutoScroll = false,
    padding = 'xl',
    isGenerating = false,
    isPreview = false,
}) => {
    const viewport = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        if (!enableAutoScroll || !viewport.current) return;

        const scrollToBottom = () => {
            const element = viewport.current!;
            element.scrollTo({
                top: element.scrollHeight,
                behavior: 'smooth',
            });
        };

        const raf = requestAnimationFrame(scrollToBottom);
        const timeout = setTimeout(scrollToBottom, 300);

        return () => {
            cancelAnimationFrame(raf);
            clearTimeout(timeout);
        };
    }, [enableAutoScroll, isGenerating, thread?.messages.length]);

    return (
        <ScrollArea
            h={height}
            type={showScrollbar ? 'hover' : 'never'}
            offsetScrollbars="y"
            styles={{
                content: {
                    flex: 1,
                },
            }}
            viewportRef={viewport}
        >
            <Stack
                {...ChatElementsUtils.centeredElementProps}
                gap="xl"
                //  Padding left to make up space from the scrollbar
                pl={padding}
            >
                {thread.messages.map((message, i, xs) => {
                    return (
                        <Fragment key={`${message.role}-${message.uuid}`}>
                            {ChatElementsUtils.shouldRenderDivider(
                                message,
                                i,
                                xs,
                            ) && (
                                <Divider
                                    label={ChatElementsUtils.getDividerLabel(
                                        message.createdAt,
                                    )}
                                    labelPosition="center"
                                    my="sm"
                                />
                            )}
                            <AiThreadMessage
                                message={message}
                                agentName={agentName}
                                isPreview={isPreview}
                            />
                        </Fragment>
                    );
                })}
            </Stack>
        </ScrollArea>
    );
};
