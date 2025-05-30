import {
    Avatar,
    Box,
    Group,
    NavLink,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { Link, Navigate, Outlet, useParams } from 'react-router';
import LinkButton from '../../../components/common/LinkButton';
import Page from '../../../components/common/Page/Page';
import PageSpinner from '../../../components/PageSpinner';
import {
    useAiAgent,
    useAiAgentThreads,
} from '../../features/aiCopilot/hooks/useAiAgents';

const AgentPage = () => {
    const { agentUuid } = useParams();
    const { data: threads } = useAiAgentThreads(agentUuid ?? '');

    const { data: agent, isLoading: isLoadingAgent } = useAiAgent(
        agentUuid ?? '',
    );

    if (isLoadingAgent) {
        return <PageSpinner />;
    }

    if (!agent) {
        return <Navigate to={`/aiAgents`} />;
    }

    return (
        <Page
            withPaddedContent
            sidebar={
                <Stack gap="xl" align="stretch">
                    <Stack align="flex-start">
                        <LinkButton href={`/aiAgents`} leftIcon={IconArrowLeft}>
                            All agents
                        </LinkButton>
                        <Group>
                            <Avatar size="lg" radius="xl" />
                            <Box>
                                <Title order={3}>{agent.name}</Title>
                                <Text size="sm" c="dimmed">
                                    Last modified:{' '}
                                    {new Date(
                                        agent.updatedAt ?? new Date(),
                                    ).toLocaleString()}
                                </Text>
                            </Box>
                        </Group>
                    </Stack>
                    {agent.tags && (
                        <Stack gap="xs">
                            <Text size="md">Tags</Text>
                            <Text size="sm" c="dimmed">
                                {agent.tags.join(', ')}
                            </Text>
                        </Stack>
                    )}
                    {agent.instruction && (
                        <Stack gap="xs">
                            <Text size="md">Instructions</Text>
                            <Text size="sm" c="dimmed">
                                {agent.instruction}
                            </Text>
                        </Stack>
                    )}
                    {threads && (
                        <Stack gap="xs">
                            <Text size="md">Recent conversations</Text>
                            {threads.slice(0, 5).map((thread) => (
                                <NavLink
                                    label={thread.firstMessage}
                                    key={thread.uuid}
                                    component={Link}
                                    to={`/aiAgents/${agentUuid}/threads/${thread.uuid}`}
                                />
                            ))}
                            <Link to={`/aiAgents/${agentUuid}/threads`}>
                                View all
                            </Link>
                        </Stack>
                    )}
                    <Link to={`/generalSettings/aiAgents/${agentUuid}`}>
                        Settings
                    </Link>
                </Stack>
            }
        >
            <Group align="flex-start" gap="xl">
                <Box style={{ flex: 1 }}>
                    <Outlet />
                </Box>
            </Group>
        </Page>
    );
};

export default AgentPage;
