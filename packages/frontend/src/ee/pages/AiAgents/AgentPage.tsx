import { type AiAgent, type AiAgentThreadSummary } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Divider,
    Group,
    Loader,
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
    IconMessageCirclePlus,
    IconPlus,
    IconSettings,
} from '@tabler/icons-react';
import { type FC, useState } from 'react';
import { Link, Navigate, Outlet, useParams } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { AgentSwitcher } from '../../features/aiCopilot/components/AgentSwitcher';
import { AiAgentPageLayout } from '../../features/aiCopilot/components/AiAgentPageLayout';
import { useAiAgentPermission } from '../../features/aiCopilot/hooks/useAiAgentPermission';
import {
    useAiAgent,
    useAiAgentThreads,
} from '../../features/aiCopilot/hooks/useOrganizationAiAgents';
import { useProjectAiAgents } from '../../features/aiCopilot/hooks/useProjectAiAgents';

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
                {thread.firstMessage}
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
const AgentPage = () => {
    const { agentUuid, threadUuid, projectUuid } = useParams();
    const { data: threads } = useAiAgentThreads(agentUuid);
    const canManageAgents = useAiAgentPermission({
        action: 'manage',
        projectUuid,
    });

    const { data: agentsList } = useProjectAiAgents(projectUuid!);

    const { data: agent, isLoading: isLoadingAgent } = useAiAgent(agentUuid);

    const [showMaxItems, setShowMaxItems] = useState(INITIAL_MAX_THREADS);

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
                <Stack gap="xl" align="stretch">
                    <Stack align="flex-start" gap="xs">
                        <Title order={6} c="dimmed" tt="uppercase" size="xs">
                            Agents
                        </Title>
                        {canManageAgents && (
                            <Button
                                size="compact-xs"
                                variant="subtle"
                                component={Link}
                                to={`/projects/${projectUuid}/ai-agents/new`}
                                leftSection={<MantineIcon icon={IconPlus} />}
                            >
                                New agent
                            </Button>
                        )}
                        <Group gap="xs" w="100%" wrap="nowrap">
                            {agentsList && agentsList.length && (
                                <AgentSwitcher
                                    projectUuid={projectUuid!}
                                    agents={agentsList}
                                    selectedAgent={agent}
                                />
                            )}
                            {canManageAgents && (
                                <ActionIcon
                                    variant="subtle"
                                    size="lg"
                                    styles={(theme) => ({
                                        root: {
                                            borderRadius: theme.radius.md,
                                        },
                                    })}
                                    component={Link}
                                    color="gray"
                                    to={`/projects/${projectUuid}/ai-agents/${agent.uuid}/edit`}
                                >
                                    <MantineIcon icon={IconSettings} />
                                </ActionIcon>
                            )}
                        </Group>
                    </Stack>
                    <Divider variant="dashed" />

                    {projectUuid && threads && (
                        <Stack gap="xs">
                            <Group justify="space-between">
                                <Title
                                    order={6}
                                    c="dimmed"
                                    tt="uppercase"
                                    size="xs"
                                >
                                    Threads
                                </Title>
                                <Button
                                    size="compact-xs"
                                    variant="dark"
                                    leftSection={
                                        <MantineIcon
                                            strokeWidth={1.8}
                                            icon={IconMessageCirclePlus}
                                        />
                                    }
                                    component={Link}
                                    to={`/projects/${projectUuid}/ai-agents/${agent.uuid}/threads`}
                                >
                                    New thread
                                </Button>
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
                                {threads
                                    .slice(0, showMaxItems)
                                    .map((thread) => (
                                        <ThreadNavLink
                                            key={thread.uuid}
                                            thread={thread}
                                            isActive={
                                                thread.uuid === threadUuid
                                            }
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
                                                (s) =>
                                                    s + MAX_THREADS_INCREMENT,
                                            )
                                        }
                                        leftSection={
                                            <MantineIcon
                                                icon={IconChevronDown}
                                            />
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
