import { type AiAgent, type AiAgentThreadSummary } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Center,
    Divider,
    Group,
    Loader,
    NavLink,
    Paper,
    Pill,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine-8/core';
import {
    IconArrowLeft,
    IconBrandSlack,
    IconChevronDown,
    IconDatabase,
    IconPencil,
    IconSettings,
} from '@tabler/icons-react';
import { type FC, useState } from 'react';
import { Link, Navigate, Outlet, useParams } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import Page from '../../../components/common/Page/Page';
import { useProject } from '../../../hooks/useProject';
import useApp from '../../../providers/App/useApp';
import { AgentSwitcher } from '../../features/aiCopilot/components/AgentSwitcher';
import ClampedTextWithPopover from '../../features/aiCopilot/components/ClampedTextWithPopover';
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
        mx={-8}
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
    const { user } = useApp();
    const { agentUuid, threadUuid, projectUuid } = useParams();
    const { data: threads } = useAiAgentThreads(agentUuid);

    const { data: agentsList } = useProjectAiAgents(projectUuid!);

    const { data: agent, isLoading: isLoadingAgent } = useAiAgent(agentUuid);
    const { data: project } = useProject(agent?.projectUuid);

    const [showMaxItems, setShowMaxItems] = useState(INITIAL_MAX_THREADS);

    if (isLoadingAgent) {
        return (
            <Page withFullHeight>
                <Center h="100%">
                    <Loader color="gray" />
                </Center>
            </Page>
        );
    }

    if (!agent) {
        return <Navigate to={`/projects/${projectUuid}/ai-agents`} />;
    }

    return (
        <Page
            sidebar={
                <Stack gap="xl" align="stretch">
                    <Stack align="flex-start" gap="xs">
                        <Button
                            size="compact-xs"
                            variant="subtle"
                            component={Link}
                            to={`/projects/${projectUuid}/ai-agents`}
                            leftSection={<MantineIcon icon={IconArrowLeft} />}
                        >
                            All agents
                        </Button>
                        <Group gap="xs" w="100%" wrap="nowrap">
                            {agentsList && agentsList.length && (
                                <AgentSwitcher
                                    projectUuid={projectUuid!}
                                    agents={agentsList}
                                    selectedAgent={agent}
                                />
                            )}
                            {user?.data?.ability.can('manage', 'AiAgent') && (
                                <ActionIcon
                                    variant="subtle"
                                    size="lg"
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
                    {agent.instruction && (
                        <Stack gap="xs">
                            <Title order={6}>Instructions</Title>
                            <Paper p="xs" bg="gray.0" c="gray.7">
                                <ClampedTextWithPopover>
                                    {agent.instruction}
                                </ClampedTextWithPopover>
                            </Paper>
                        </Stack>
                    )}

                    {project && (
                        <Stack gap="xs">
                            <Title order={6}>Lightdash Data Sources</Title>
                            <Paper p="xs" c="gray.7">
                                <Group gap="xs">
                                    <IconDatabase size={16} />
                                    {project.name}
                                </Group>
                            </Paper>
                            {agent.tags && (
                                <Group gap="xxs">
                                    {agent.tags.map((tag, i) => (
                                        <Pill key={i} size="sm">
                                            {tag}
                                        </Pill>
                                    ))}
                                </Group>
                            )}
                        </Stack>
                    )}

                    {projectUuid && threads && (
                        <Stack gap="xs">
                            <Group justify="space-between">
                                <Title order={6}>Threads</Title>
                                <Button
                                    size="compact-sm"
                                    variant="dark"
                                    leftSection={<IconPencil size={16} />}
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
                                        style={{ borderStyle: 'dashed' }}
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
        </Page>
    );
};

export interface AgentContext {
    agent: AiAgent;
}

export default AgentPage;
