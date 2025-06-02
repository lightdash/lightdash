import { Box, Button, Group, Stack, Text, Title } from '@mantine-8/core';
import { IconArrowLeft, IconChevronDown, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { Link, Navigate, Outlet, useParams } from 'react-router';
import { LightdashUserAvatar } from '../../../components/Avatar';
import LinkButton from '../../../components/common/LinkButton';
import Page from '../../../components/common/Page/Page';
import PageSpinner from '../../../components/PageSpinner';
import useApp from '../../../providers/App/useApp';
import AgentThreadCard, {
    AgentThreadCardEmpty,
} from '../../features/aiCopilot/components/AgentThreadCard';
import {
    useAiAgent,
    useAiAgentThreads,
} from '../../features/aiCopilot/hooks/useAiAgents';

const INITIAL_MAX_THREADS = 10;
const MAX_THREADS_INCREMENT = 10;

const AgentPage = () => {
    const { user } = useApp();
    const { agentUuid, threadUuid } = useParams();
    const { data: threads } = useAiAgentThreads(agentUuid ?? '');

    const { data: agent, isLoading: isLoadingAgent } = useAiAgent(agentUuid!);

    const [showMaxItems, setShowMaxItems] = useState(INITIAL_MAX_THREADS);

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
                            <LightdashUserAvatar
                                size="lg"
                                variant="filled"
                                name={agent.name || 'AI'}
                            />
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
                    <Group>
                        <Button
                            leftSection={<IconPlus />}
                            component={Link}
                            to={`/aiAgents/${agent.uuid}/threads`}
                        >
                            New thread
                        </Button>
                        {user?.data?.ability.can('manage', 'AiAgent') && (
                            <Button
                                variant="default"
                                c="dimmed"
                                bd="none"
                                component={Link}
                                to={`/generalSettings/aiAgents/${agent.uuid}`}
                            >
                                Settings
                            </Button>
                        )}
                    </Group>
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
                            <Title order={5}>Threads</Title>
                            {threads.slice(0, showMaxItems).map((thread) => (
                                <AgentThreadCard
                                    key={thread.uuid}
                                    thread={thread}
                                    isActive={thread.uuid === threadUuid}
                                />
                            ))}
                            {threads.length >= showMaxItems && (
                                <AgentThreadCardEmpty
                                    onClick={() =>
                                        setShowMaxItems(
                                            (s) => s + MAX_THREADS_INCREMENT,
                                        )
                                    }
                                >
                                    <Group gap="xs">
                                        <IconChevronDown />
                                        <Text size="sm">View more</Text>
                                    </Group>
                                </AgentThreadCardEmpty>
                            )}
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
