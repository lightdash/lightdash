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
import { IconExternalLink, IconSettings, IconX } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useAiAgentThread } from '../../hooks/useProjectAiAgents';
import { AgentChatDisplay } from '../ChatElements/AgentChatDisplay';
import { EvalAssessmentDisplay } from '../Evals/EvalAssessmentDisplay';

type ThreadPreviewSidebarProps = {
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    isOpen: boolean;
    onClose: () => void;
    showAddToEvalsButton?: boolean;
    evalUuid?: string;
    runUuid?: string;
};

export const ThreadPreviewSidebar: FC<ThreadPreviewSidebarProps> = ({
    projectUuid,
    agentUuid,
    threadUuid,
    isOpen,
    onClose,
    showAddToEvalsButton = false,
    evalUuid,
    runUuid,
}) => {
    const { data: threadData, isLoading: isLoadingThread } = useAiAgentThread(
        projectUuid,
        agentUuid,
        threadUuid,
    );

    if (!isOpen || !threadUuid) {
        return null;
    }

    return (
        <Box h="100%" pos="relative" bg="background">
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
                            to={`/projects/${projectUuid}/ai-agents/${agentUuid}/threads/${threadUuid}`}
                        >
                            <MantineIcon icon={IconExternalLink} />
                        </ActionIcon>
                    </Tooltip>
                </Group>
                <Group gap="xs">
                    <Tooltip
                        label="Open Agent Settings"
                        variant="xs"
                        position="right"
                    >
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            component={Link}
                            target="_blank"
                            to={`/projects/${projectUuid}/ai-agents/${agentUuid}/edit`}
                        >
                            <MantineIcon icon={IconSettings} />
                        </ActionIcon>
                    </Tooltip>
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
            </Group>

            <Divider />

            {threadData && (
                <Box mah="calc(100vh - 150px)" style={{ overflowY: 'auto' }}>
                    {evalUuid && runUuid && (
                        <EvalAssessmentDisplay
                            projectUuid={projectUuid}
                            agentUuid={agentUuid}
                            evalUuid={evalUuid}
                            runUuid={runUuid}
                            threadUuid={threadUuid}
                        />
                    )}
                    <AgentChatDisplay
                        thread={threadData}
                        projectUuid={projectUuid}
                        agentUuid={agentUuid}
                        showAddToEvalsButton={showAddToEvalsButton}
                        renderArtifactsInline
                    />
                </Box>
            )}
        </Box>
    );
};
