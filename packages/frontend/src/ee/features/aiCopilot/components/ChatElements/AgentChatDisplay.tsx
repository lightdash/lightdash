import { type AiAgentThread } from '@lightdash/common';
import { Box, Divider, Flex, getDefaultZIndex, Stack } from '@mantine-8/core';
import {
    Fragment,
    useRef,
    useState,
    type FC,
    type PropsWithChildren,
} from 'react';
import ErrorBoundary from '../../../../../features/errorBoundary/ErrorBoundary';
import { AddToEvalModal } from '../Admin/AddToEvalModal';
import { AssistantBubble } from './AgentChatAssistantBubble';
import { UserBubble } from './AgentChatUserBubble';
import ThreadScrollToBottom from './ScrollToBottom';
import { ChatElementsUtils } from './utils';

type Props = {
    thread: AiAgentThread;
    promptUuid?: string;
    agentName?: string;
    height?: string | number;
    showScrollbar?: boolean;
    enableAutoScroll?: boolean;
    padding?: string;
    debug?: boolean;
    projectUuid?: string;
    agentUuid?: string;
    renderArtifactsInline?: boolean;
    showAddToEvalsButton?: boolean;
};

export const AgentChatDisplay: FC<PropsWithChildren<Props>> = ({
    thread,
    height = '100%',
    enableAutoScroll = false,
    children,
    debug,
    projectUuid,
    agentUuid,
    renderArtifactsInline = false,
    showAddToEvalsButton = false,
}) => {
    const viewport = useRef<HTMLDivElement>(null);
    const [addToEvalsPromptUuid, setAddToEvalsPromptUuid] = useState<
        string | null
    >(null);

    return (
        <Flex
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
                    {thread.messages.map((message, i, xs) => (
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

                            {message.role === 'user' ? (
                                <UserBubble message={message} />
                            ) : (
                                <ErrorBoundary>
                                    {projectUuid && agentUuid && (
                                        <AssistantBubble
                                            message={message}
                                            debug={debug}
                                            projectUuid={projectUuid}
                                            agentUuid={agentUuid}
                                            onAddToEvals={
                                                setAddToEvalsPromptUuid
                                            }
                                            showAddToEvalsButton={
                                                showAddToEvalsButton
                                            }
                                            renderArtifactsInline={
                                                renderArtifactsInline
                                            }
                                        />
                                    )}
                                </ErrorBoundary>
                            )}
                        </Fragment>
                    ))}
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

            {showAddToEvalsButton &&
                projectUuid &&
                agentUuid &&
                addToEvalsPromptUuid && (
                    <AddToEvalModal
                        isOpen={!!addToEvalsPromptUuid}
                        onClose={() => setAddToEvalsPromptUuid(null)}
                        projectUuid={projectUuid}
                        agentUuid={agentUuid}
                        threadUuid={thread.uuid}
                        promptUuid={addToEvalsPromptUuid}
                    />
                )}
        </Flex>
    );
};
