import { type AiAgent, type AiAgentThreadSummary } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Group,
    Loader,
    Menu,
    NavLink,
    Paper,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine-8/core';
import {
    IconBrandSlack,
    IconChevronDown,
    IconCirclePlus,
    IconDots,
    IconPlus,
    IconSettings,
} from '@tabler/icons-react';
import { type FC, useState } from 'react';
import { Link, Navigate, Outlet, useParams } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { AgentSwitcher } from '../../features/aiCopilot/components/AgentSwitcher';
import { AiAgentPageLayout } from '../../features/aiCopilot/components/AiAgentPageLayout/AiAgentPageLayout';
import { SidebarButton } from '../../features/aiCopilot/components/AiAgentPageLayout/SidebarButton';
import { useAiAgentPermission } from '../../features/aiCopilot/hooks/useAiAgentPermission';
import {
    useAiAgent,
    useAiAgentThreads,
} from '../../features/aiCopilot/hooks/useOrganizationAiAgents';
import { useProjectAiAgents } from '../../features/aiCopilot/hooks/useProjectAiAgents';
import { useAiAgentPageLayout } from '../../features/aiCopilot/providers/AiLayoutProvider';

const INITIAL_MAX_THREADS = 10;
const MAX_THREADS_INCREMENT = 10;

type ThreadNavLinkProps = {
    thread: AiAgentThreadSummary;
    isActive: boolean;
    projectUuid: string;
};

const ThreadNavLink: FC<ThreadNavLinkProps> = ({
    thread,
    isActive,
    projectUuid,
}) => (
    <NavLink
        color="gray"
        component={Link}
        key={thread.uuid}
        to={`/projects/${projectUuid}/ai-agents/${thread.agentUuid}/threads/${thread.uuid}`}
        px="xs"
        py={4}
        ml={-8}
        // to compensate for negative left margin and balanced visual alignment
        w={`calc(100% + 1rem)`}
        style={(theme) => ({
            borderRadius: theme.radius.sm,
        })}
        label={
            <Text truncate="end" size="sm" c="gray.7">
                {thread.firstMessage.message}
            </Text>
        }
        active={isActive}
        rightSection={
            thread.createdFrom === 'slack' && (
                <Tooltip label={'Threads created in slack are read only'}>
                    <IconBrandSlack size={18} stroke={1} />
                </Tooltip>
            )
        }
        viewTransition
    />
);

const AgentSidebar: FC<{
    agent: AiAgent;
    projectUuid: string;
    threadUuid?: string;
}> = ({ agent, projectUuid, threadUuid }) => {
    const { data: threads } = useAiAgentThreads(projectUuid, agent.uuid);
    const [showMaxItems, setShowMaxItems] = useState(INITIAL_MAX_THREADS);
    const { isSidebarCollapsed } = useAiAgentPageLayout();

    return (
        <Stack gap="md">
            <Box>
                <SidebarButton
                    leftSection={<MantineIcon icon={IconCirclePlus} />}
                    component={Link}
                    to={`/projects/${projectUuid}/ai-agents/${agent.uuid}/threads`}
                    size="sm"
                    color="gray.9"
                    {...(!isSidebarCollapsed && {
                        fullWidth: true,
                        justify: 'flex-start',
                        w: 'calc(100% + 1rem)',
                    })}
                >
                    {isSidebarCollapsed ? '' : 'New thread'}
                </SidebarButton>
            </Box>

            {projectUuid && threads && !isSidebarCollapsed && (
                <Stack gap="xs">
                    <Group justify="space-between">
                        <Title order={6} c="dimmed" tt="uppercase" size="xs">
                            Recent
                        </Title>
                    </Group>
                    <Stack gap={2}>
                        {threads.length === 0 && (
                            <Paper
                                withBorder
                                style={{
                                    borderStyle: 'dashed',
                                    backgroundColor: 'transparent',
                                }}
                                p="sm"
                            >
                                <Text
                                    truncate="end"
                                    size="sm"
                                    c="gray.6"
                                    ta="center"
                                >
                                    No threads yet
                                </Text>
                            </Paper>
                        )}
                        {threads.slice(0, showMaxItems).map((thread) => (
                            <ThreadNavLink
                                key={thread.uuid}
                                thread={thread}
                                isActive={thread.uuid === threadUuid}
                                projectUuid={projectUuid}
                            />
                        ))}
                    </Stack>
                    <Box>
                        {threads.length >= showMaxItems && (
                            <Button
                                mx={-8}
                                size="compact-xs"
                                variant="subtle"
                                onClick={() =>
                                    setShowMaxItems(
                                        (s) => s + MAX_THREADS_INCREMENT,
                                    )
                                }
                                leftSection={
                                    <MantineIcon icon={IconChevronDown} />
                                }
                                style={{
                                    root: {
                                        border: 'none',
                                    },
                                }}
                            >
                                View more
                            </Button>
                        )}
                    </Box>
                </Stack>
            )}
        </Stack>
    );
};

const AgentPage = () => {
    const { agentUuid, threadUuid, projectUuid } = useParams();
    const canManageAgents = useAiAgentPermission({
        action: 'manage',
        projectUuid,
    });

    const { data: agentsList } = useProjectAiAgents({
        projectUuid: projectUuid!,
        redirectOnUnauthorized: true,
    });

    const { data: agent, isLoading: isLoadingAgent } = useAiAgent(
        projectUuid!,
        agentUuid!,
    );

    if (isLoadingAgent) {
        return (
            <Box
                h="100vh"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'white',
                }}
            >
                <Loader color="gray" />
            </Box>
        );
    }

    if (!agent) {
        return <Navigate to={`/projects/${projectUuid}/ai-agents`} />;
    }

    return (
        <AiAgentPageLayout
            Sidebar={
                <AgentSidebar
                    agent={agent}
                    projectUuid={projectUuid!}
                    threadUuid={threadUuid}
                />
            }
            Header={
                <Group align="center" justify="space-between">
                    <Group gap="sm">
                        <Box maw={300}>
                            {agentsList && agentsList.length && (
                                <AgentSwitcher
                                    projectUuid={projectUuid!}
                                    agents={agentsList}
                                    selectedAgent={agent}
                                />
                            )}
                        </Box>
                    </Group>
                    <Group gap="sm">
                        {canManageAgents && (
                            <Menu>
                                <Menu.Target>
                                    <ActionIcon variant="subtle" color="gray">
                                        <MantineIcon icon={IconDots} />
                                    </ActionIcon>
                                </Menu.Target>

                                <Menu.Dropdown>
                                    <Menu.Item
                                        leftSection={
                                            <MantineIcon icon={IconPlus} />
                                        }
                                        component={Link}
                                        to={`/projects/${projectUuid}/ai-agents/new`}
                                    >
                                        New agent
                                    </Menu.Item>
                                    <Menu.Item
                                        component={Link}
                                        to={`/projects/${projectUuid}/ai-agents/${agent.uuid}/edit`}
                                        leftSection={
                                            <MantineIcon icon={IconSettings} />
                                        }
                                    >
                                        Settings
                                    </Menu.Item>
                                </Menu.Dropdown>
                            </Menu>
                        )}
                    </Group>
                </Group>
            }
        >
            <Outlet context={{ agent }} />
        </AiAgentPageLayout>
    );
};

export interface AgentContext {
    agent: AiAgent;
}

export default AgentPage;
