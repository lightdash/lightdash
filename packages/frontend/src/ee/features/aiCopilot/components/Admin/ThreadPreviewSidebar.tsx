import {
    type AiAgentAdminThreadSummary,
    type AiAgentMessageAssistant,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Divider,
    Group,
    LoadingOverlay,
    Modal,
    Title,
    Tooltip,
} from '@mantine-8/core';
import { IconExternalLink, IconX } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useAiAgentThread } from '../../hooks/useProjectAiAgents';
import {
    AiAgentPageLayoutContext,
    type ArtifactData,
} from '../../providers/AiLayoutProvider';
import { AgentChatDisplay } from '../ChatElements/AgentChatDisplay';
import { AiArtifactPanel } from '../ChatElements/AiArtifactPanel';

type ThreadPreviewSidebarProps = {
    thread: AiAgentAdminThreadSummary;
    isOpen: boolean;
    onClose: () => void;
};

export const ThreadPreviewSidebar: FC<ThreadPreviewSidebarProps> = ({
    thread,
    isOpen,
    onClose,
}) => {
    const { data: threadData, isLoading: isLoadingThread } = useAiAgentThread(
        thread.project.uuid,
        thread.agent.uuid,
        thread.uuid,
    );

    const [contextArtifact, setContextArtifact] = useState<ArtifactData | null>(
        null,
    );

    const setArtifact = (
        artifactUuid: string,
        versionUuid: string,
        message: AiAgentMessageAssistant,
        messageProjectUuid: string,
        messageAgentUuid: string,
    ) => {
        setContextArtifact({
            artifactUuid,
            versionUuid,
            message,
            projectUuid: messageProjectUuid,
            agentUuid: messageAgentUuid,
        });
    };

    const clearArtifact = () => {
        setContextArtifact(null);
    };

    if (!isOpen || !thread) {
        return null;
    }

    return (
        <Box h="100%" pos="relative" bg="white">
            <LoadingOverlay
                pos="absolute"
                visible={isLoadingThread}
                loaderProps={{ color: 'dark' }}
            />

            <Group justify="space-between" align="flex-start" p="sm">
                <Group gap="xs">
                    <Title order={5} fw={600}>
                        Thread Preview
                    </Title>
                    <Tooltip label="Open Thread" variant="xs" position="right">
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            component={Link}
                            target="_blank"
                            to={`/projects/${thread.project.uuid}/ai-agents/${thread.agent.uuid}/threads/${thread.uuid}`}
                        >
                            <MantineIcon icon={IconExternalLink} />
                        </ActionIcon>
                    </Tooltip>
                </Group>
                <Button
                    variant="subtle"
                    size="xs"
                    p={4}
                    onClick={onClose}
                    color="gray"
                >
                    <MantineIcon icon={IconX} size="sm" />
                </Button>
            </Group>

            <Divider />

            {threadData && (
                <>
                    <AiAgentPageLayoutContext.Provider
                        value={{
                            artifact: contextArtifact,
                            setArtifact,
                            isSidebarCollapsed: false,
                            collapseSidebar: () => {},
                            expandSidebar: () => {},
                            toggleSidebar: () => {},
                            collapseArtifact: () => {},
                            expandArtifact: () => {},
                            clearArtifact,
                            agentUuid: thread.agent.uuid,
                            projectUuid: thread.project.uuid,
                        }}
                    >
                        <Box
                            mah="calc(100vh - 150px)"
                            style={{ overflowY: 'auto' }}
                        >
                            <AgentChatDisplay
                                thread={threadData}
                                agentName={thread.agent.name}
                            />
                        </Box>
                        {!!contextArtifact && (
                            <Modal
                                withinPortal
                                opened={!!contextArtifact}
                                onClose={clearArtifact}
                                size="lg"
                                withCloseButton={false}
                                centered
                                mih="90vh"
                                styles={{
                                    body: {
                                        height: '500px',
                                        padding: 0,
                                    },
                                }}
                            >
                                {contextArtifact && <AiArtifactPanel />}
                            </Modal>
                        )}
                    </AiAgentPageLayoutContext.Provider>
                </>
            )}
        </Box>
    );
};
