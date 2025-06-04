import { type AiAgentThreadSummary } from '@lightdash/common';
import {
    Box,
    Button,
    Divider,
    Group,
    List,
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
    IconClockEdit,
    IconDatabase,
    IconMessages,
    IconPlus,
} from '@tabler/icons-react';
import { type FC, useState } from 'react';
import { Link, Navigate, Outlet, useParams } from 'react-router';
import { LightdashUserAvatar } from '../../../components/Avatar';
import MantineIcon from '../../../components/common/MantineIcon';
import Page from '../../../components/common/Page/Page';
import PageSpinner from '../../../components/PageSpinner';
import { useProject } from '../../../hooks/useProject';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import useApp from '../../../providers/App/useApp';
import {
    useAiAgent,
    useAiAgentThreads,
} from '../../features/aiCopilot/hooks/useAiAgents';

const INITIAL_MAX_THREADS = 10;
const MAX_THREADS_INCREMENT = 10;

type ThreadNavLinkProps = {
    thread: AiAgentThreadSummary;
    isActive: boolean;
};

const ThreadNavLink: FC<ThreadNavLinkProps> = ({ thread, isActive }) => (
    <NavLink
        color="gray"
        component={Link}
        key={thread.uuid}
        to={`/aiAgents/${thread.agentUuid}/threads/${thread.uuid}`}
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
    const { agentUuid, threadUuid } = useParams();
    const { data: threads } = useAiAgentThreads(agentUuid ?? '');

    const { data: agent, isLoading: isLoadingAgent } = useAiAgent(agentUuid!);
    const { data: project } = useProject(agent?.projectUuid);

    const updatedAt = agent?.updatedAt ? new Date(agent.updatedAt) : new Date();
    const updatedTimeAgo = useTimeAgo(updatedAt);

    const [showMaxItems, setShowMaxItems] = useState(INITIAL_MAX_THREADS);

    if (isLoadingAgent) {
        return <PageSpinner />;
    }

    if (!agent) {
        return <Navigate to={`/aiAgents`} />;
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
                            to="/aiAgents"
                            leftSection={<MantineIcon icon={IconArrowLeft} />}
                            style={{
                                root: {
                                    border: 'none',
                                },
                            }}
                        >
                            All agents
                        </Button>
                        <Group>
                            <LightdashUserAvatar
                                size="md"
                                variant="filled"
                                name={agent.name || 'AI'}
                                src={agent.imageUrl}
                            />
                            <Title order={3}>{agent.name}</Title>
                        </Group>
                        <List spacing="xxs" size="sm" c="dimmed" center>
                            <List.Item icon={<IconClockEdit size={16} />}>
                                Last updated{' '}
                                <Tooltip
                                    label={updatedAt.toLocaleString()}
                                    withinPortal
                                >
                                    <span>{updatedTimeAgo}</span>
                                </Tooltip>
                            </List.Item>
                            <List.Item icon={<IconMessages size={16} />}>
                                {threads?.length || 0} threads
                            </List.Item>
                        </List>
                    </Stack>
                    <Group gap="sm">
                        <Button
                            variant="dark"
                            leftSection={<IconPlus size={16} />}
                            component={Link}
                            size="xs"
                            to={`/aiAgents/${agent.uuid}/threads`}
                        >
                            New thread
                        </Button>
                        {user?.data?.ability.can('manage', 'AiAgent') && (
                            <Button
                                variant="default"
                                size="xs"
                                component={Link}
                                to={`/generalSettings/aiAgents/${agent.uuid}`}
                            >
                                Settings
                            </Button>
                        )}
                    </Group>
                    <Divider variant="dashed" />
                    {agent.instruction && (
                        <Stack gap="xs">
                            <Title order={6}>Instructions</Title>
                            <Paper p="xs" bg="gray.0" c="gray.7">
                                {agent.instruction}
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

                    {threads && threads.length > 0 && (
                        <Stack gap="xs">
                            <Title order={6}>Threads</Title>
                            <Stack gap={2}>
                                {threads
                                    .slice(0, showMaxItems)
                                    .map((thread) => (
                                        <ThreadNavLink
                                            thread={thread}
                                            isActive={
                                                thread.uuid === threadUuid
                                            }
                                            key={thread.uuid}
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
            <Outlet />
        </Page>
    );
};

export default AgentPage;
