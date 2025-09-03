import { type AiAgentAdminThreadSummary } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Divider,
    Group,
    LoadingOverlay,
    Title,
    Tooltip,
} from '@mantine-8/core';
import { IconExternalLink, IconX } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useAiAgentThread } from '../../hooks/useOrganizationAiAgents';
import { AiAgentPageLayoutContext } from '../../providers/AiLayoutProvider';
import { AgentChatDisplay } from '../ChatElements/AgentChatDisplay';

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

    if (!isOpen) {
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
                <AiAgentPageLayoutContext.Provider
                    value={{
                        artifact: null,
                        setArtifact: () => {},
                        isSidebarCollapsed: false,
                        collapseSidebar: () => {},
                        expandSidebar: () => {},
                        toggleSidebar: () => {},
                        collapseArtifact: () => {},
                        expandArtifact: () => {},
                        clearArtifact: () => {},
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
                </AiAgentPageLayoutContext.Provider>
            )}
        </Box>
    );
};
