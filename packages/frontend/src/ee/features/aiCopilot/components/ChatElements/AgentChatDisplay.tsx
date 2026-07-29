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
    useMemo,
    useRef,
    useState,
    type FC,
    type PropsWithChildren,
} from 'react';
import ErrorBoundary from '../../../../../features/errorBoundary/ErrorBoundary';
import { useDeepResearchThreadRunRegistrations } from '../../hooks/useDeepResearch';
import { useAgentAiMcpServers } from '../../hooks/useProjectAiMcpServers';
import { AddToEvalModal } from '../Admin/AddToEvalModal';
import { DeepResearchThreadRuns } from '../DeepResearch/DeepResearchThreadRuns';
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
    onDashboardLinkClick?: (url: string) => void;
    canRetryDeepResearch?: boolean;
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
    onDashboardLinkClick,
    canRetryDeepResearch = false,
}) => {
    const viewport = useRef<HTMLDivElement>(null);
    const { data: mcpServers } = useAgentAiMcpServers(projectUuid, agentUuid, {
        enabled: !!projectUuid && !!agentUuid,
    });
    const [addToEvalsPromptUuid, setAddToEvalsPromptUuid] = useState<
        string | null
    >(null);
    // Deep research prompts never receive a chat response — the run card is
    // the response — so their assistant bubbles must not render (they would
    // show as failed generations).
    const deepResearchRegistrations = useDeepResearchThreadRunRegistrations({
        projectUuid,
        threadUuid: thread.uuid,
    });
    const deepResearchRegistrationsByPromptUuid = useMemo(
        () =>
            deepResearchRegistrations.reduce(
                (registrationsByPromptUuid, registration) => {
                    const promptRegistrations =
                        registrationsByPromptUuid.get(
                            registration.promptUuid,
                        ) ?? [];
                    registrationsByPromptUuid.set(registration.promptUuid, [
                        ...promptRegistrations,
                        registration,
                    ]);
                    return registrationsByPromptUuid;
                },
                new Map<string, typeof deepResearchRegistrations>(),
            ),
        [deepResearchRegistrations],
    );
    const deepResearchPromptUuids = useMemo(
        () => new Set(deepResearchRegistrationsByPromptUuid.keys()),
        [deepResearchRegistrationsByPromptUuid],
    );
    const compactionsByTriggeringPromptUuid = new Map(
        thread.compactions.map((compaction) => [
            compaction.triggeringPromptUuid,
            compaction,
        ]),
    );
    // Hidden turns are answered by the agent but are not part of the visible
    // conversation. Deep research assistant rows are replaced by run cards.
    const visibleMessages = thread.messages.filter(
        (message) =>
            !(
                (message.role === 'user' && message.hidden) ||
                (message.role === 'assistant' &&
                    deepResearchPromptUuids.has(message.uuid))
            ),
    );
    const visibleUserPromptUuids = new Set(
        visibleMessages.flatMap((message) =>
            message.role === 'user' ? [message.uuid] : [],
        ),
    );
    const unanchoredDeepResearchRegistrations =
        deepResearchRegistrations.filter(
            (registration) =>
                !visibleUserPromptUuids.has(registration.promptUuid),
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
                        {visibleMessages.map((message, i, xs) => (
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
                                    <UserBubble
                                        message={message}
                                        projectUuid={projectUuid}
                                    />
                                ) : (
                                    <ErrorBoundary>
                                        {projectUuid && agentUuid && (
                                            <AssistantBubble
                                                message={message}
                                                isLastMessage={
                                                    i === xs.length - 1
                                                }
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
                                                onDashboardLinkClick={
                                                    onDashboardLinkClick
                                                }
                                            />
                                        )}
                                    </ErrorBoundary>
                                )}

                                {message.role === 'user' && (
                                    <DeepResearchThreadRuns
                                        registrations={
                                            deepResearchRegistrationsByPromptUuid.get(
                                                message.uuid,
                                            ) ?? []
                                        }
                                        canRetry={canRetryDeepResearch}
                                    />
                                )}
                            </Fragment>
                        ))}

                        {unanchoredDeepResearchRegistrations.length > 0 && (
                            <DeepResearchThreadRuns
                                registrations={
                                    unanchoredDeepResearchRegistrations
                                }
                                canRetry={canRetryDeepResearch}
                            />
                        )}
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
