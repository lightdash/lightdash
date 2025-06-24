import { type AiAgentMessage, type AiAgentThread } from '@lightdash/common';
import { Divider, ScrollArea, Stack } from '@mantine-8/core';
import { Fragment, useRef, type FC } from 'react';
import ErrorBoundary from '../../../../../features/errorBoundary/ErrorBoundary';
import { AssistantBubble, UserBubble } from './AgentChatBubbles';
import ThreadScrollToBottom from './ScrollToBottom';
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
    mode: 'preview' | 'interactive';
};

export const AgentChatDisplay: FC<AgentChatDisplayProps> = ({
    thread,
    agentName = 'AI',
    height = '100%',
    showScrollbar = true,
    enableAutoScroll = false,
    padding = 'xl',
    mode,
}) => {
    const viewport = useRef<HTMLDivElement>(null);

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
            key={thread.uuid}
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
                                    label={
                                        message.createdAt
                                            ? ChatElementsUtils.getDividerLabel(
                                                  message.createdAt,
                                              )
                                            : undefined
                                    }
                                    labelPosition="center"
                                    my="sm"
                                />
                            )}
                            <AiThreadMessage
                                message={message}
                                agentName={agentName}
                                isPreview={mode === 'preview'}
                            />
                        </Fragment>
                    );
                })}
                {enableAutoScroll ? (
                    <ThreadScrollToBottom scrollAreaRef={viewport} />
                ) : null}
            </Stack>
        </ScrollArea>
    );
};
