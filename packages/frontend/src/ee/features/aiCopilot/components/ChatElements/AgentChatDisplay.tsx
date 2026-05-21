import { type AiAgentThread } from '@lightdash/common';
import {
    Box,
    Divider,
    Flex,
    getDefaultZIndex,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { IconCrop, IconInfoCircle } from '@tabler/icons-react';
import {
    Fragment,
    useRef,
    useState,
    type FC,
    type PropsWithChildren,
} from 'react';
import ErrorBoundary from '../../../../../features/errorBoundary/ErrorBoundary';
import { useAgentAiMcpServers } from '../../hooks/useProjectAiMcpServers';
import { AddToEvalModal } from '../Admin/AddToEvalModal';
import { AssistantBubble } from './AgentChatAssistantBubble';
import styles from './AgentChatDisplay.module.css';
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

const CompactionDivider = () => (
    <Box pos="relative" py="sm">
        <Divider my={0} />
        <Flex
            align="center"
            gap={6}
            px="sm"
            pos="absolute"
            top="50%"
            left="50%"
            style={{
                transform: 'translate(-50%, -50%)',
                backgroundColor: 'var(--mantine-color-body)',
                whiteSpace: 'nowrap',
            }}
        >
            <IconCrop
                size={14}
                stroke={1.8}
                color="var(--mantine-color-gray-5)"
            />
            <Text size="xs" c="dimmed" fw={500}>
                Summarized Conversation
            </Text>
            <Tooltip
                withinPortal
                maw={320}
                multiline
                label="Lightdash automatically summarizes earlier messages when a conversation gets long, so responses stay fast and relevant."
            >
                <Box
                    component="span"
                    aria-label="About summarized conversations"
                    style={{ display: 'inline-flex' }}
                >
                    <IconInfoCircle
                        size={14}
                        stroke={1.8}
                        color="var(--mantine-color-gray-5)"
                    />
                </Box>
            </Tooltip>
        </Flex>
    </Box>
);

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
    const { data: mcpServers } = useAgentAiMcpServers(projectUuid, agentUuid, {
        enabled: !!projectUuid && !!agentUuid,
    });
    const [addToEvalsPromptUuid, setAddToEvalsPromptUuid] = useState<
        string | null
    >(null);
    const compactionsByTriggeringPromptUuid = new Map(
        thread.compactions.map((compaction) => [
            compaction.triggeringPromptUuid,
            compaction,
        ]),
    );

    return (
        <Flex
            ref={viewport}
            direction="column"
            h={height}
            style={{ flexGrow: 1, overflowY: 'auto' }}
            pt="md"
        >
            <Flex direction="column" style={{ flexGrow: 1, minHeight: '100%' }}>
                <Stack
                    w={ChatElementsUtils.centeredElementProps.w}
                    maw={ChatElementsUtils.centeredElementProps.maw}
                    mx={ChatElementsUtils.centeredElementProps.mx}
                    px={ChatElementsUtils.centeredElementProps.px}
                    pb="md"
                    gap="xl"
                    style={{ flexGrow: 1 }}
                >
                    <Stack flex={1} style={{ flexGrow: 1 }}>
                        {thread.messages.map((message, i, xs) => (
                            <Fragment key={`${message.role}-${message.uuid}`}>
                                {message.role === 'user' &&
                                    compactionsByTriggeringPromptUuid.has(
                                        message.uuid,
                                    ) && <CompactionDivider />}

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
                                                mcpServers={mcpServers}
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

                    {enableAutoScroll && projectUuid && agentUuid ? (
                        <ThreadScrollToBottom
                            scrollAreaRef={viewport}
                            projectUuid={projectUuid}
                            agentUuid={agentUuid}
                            threadUuid={thread.uuid}
                        />
                    ) : null}
                </Stack>

                {children ? (
                    <Box
                        className={styles.composerFooter}
                        pos="sticky"
                        bottom={0}
                        w="100%"
                        style={{ zIndex: getDefaultZIndex('app') - 1 }}
                    >
                        {children}
                    </Box>
                ) : null}
            </Flex>

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
