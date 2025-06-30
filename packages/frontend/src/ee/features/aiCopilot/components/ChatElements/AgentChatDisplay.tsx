import { type AiAgentMessage, type AiAgentThread } from '@lightdash/common';
import { Box, Divider, Flex, getDefaultZIndex, Stack } from '@mantine-8/core';
import { Fragment, useRef, type FC, type PropsWithChildren } from 'react';
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

export const AgentChatDisplay: FC<PropsWithChildren<AgentChatDisplayProps>> = ({
    thread,
    agentName = 'AI',
    height = '100%',
    enableAutoScroll = false,
    mode,
    children,
}) => {
    const viewport = useRef<HTMLDivElement>(null);

    return (
        <Flex
            key={thread.uuid}
            ref={viewport}
            direction="column"
            h={height}
            style={{ flexGrow: 1, overflowY: 'auto' }}
            pt="md"
        >
            <Stack
                {...ChatElementsUtils.centeredElementProps}
                gap="xl"
                style={{ flexGrow: 1 }}
            >
                <Stack flex={1} style={{ flexGrow: 1 }}>
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
                </Stack>

                {enableAutoScroll ? (
                    <ThreadScrollToBottom scrollAreaRef={viewport} />
                ) : null}

                <Box
                    pos="sticky"
                    bottom={0}
                    w="100%"
                    style={{ zIndex: getDefaultZIndex('app') - 1 }}
                >
                    {children}
                </Box>
            </Stack>
        </Flex>
    );
};
