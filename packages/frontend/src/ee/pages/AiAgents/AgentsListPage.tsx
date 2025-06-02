import { subject } from '@casl/ability';
import { type AiAgent } from '@lightdash/common';
import {
    Badge,
    Box,
    Button,
    Card,
    Center,
    Divider,
    Grid,
    Group,
    Paper,
    Pill,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine-8/core';
import { IconBook, IconHelp, IconPlus } from '@tabler/icons-react';
import { Link } from 'react-router';
import { LightdashUserAvatar } from '../../../components/Avatar';
import MantineIcon from '../../../components/common/MantineIcon';
import Page from '../../../components/common/Page/Page';
import PageSpinner from '../../../components/PageSpinner';
import useApp from '../../../providers/App/useApp';
import { useAiAgents } from '../../features/aiCopilot/hooks/useAiAgents';

type AgentCardProps = {
    agent: AiAgent;
};

const AgentCard = ({ agent }: AgentCardProps) => {
    const { user } = useApp();

    return (
        <Card
            withBorder
            p={0}
            radius="md"
            styles={{
                root: { height: '100%' },
            }}
            component={Link}
            to={`/aiAgents/${agent.uuid}/threads`}
        >
            <Stack gap="sm" p="lg" style={{ flex: 1 }}>
                <Group gap="sm">
                    <LightdashUserAvatar
                        name={agent.name}
                        h={54}
                        w={54}
                        variant="filled"
                    />
                    <Stack gap="xs">
                        <Title order={5}>{agent.name}</Title>
                        <Group gap={4}>
                            {agent.tags && agent.tags.length > 0 ? (
                                agent.tags.map((tag) => (
                                    <Pill
                                        key={tag}
                                        variant="outline"
                                        size="sm"
                                        px="xs"
                                    >
                                        {tag}
                                    </Pill>
                                ))
                            ) : (
                                <Text size="sm" c="dimmed">
                                    Last modified:{' '}
                                    {new Date(
                                        agent.updatedAt ?? new Date(),
                                    ).toLocaleString()}
                                </Text>
                            )}
                        </Group>
                    </Stack>
                </Group>

                <Text size="sm" c="dimmed">
                    {agent.instruction}
                </Text>
            </Stack>
            <Divider />
            <Group justify="space-between" p="sm">
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
                <Button variant="default" size="sm" px="md">
                    Start a chat
                </Button>
            </Group>
        </Card>
    );
};

const AgentsListPage = () => {
    const agentsListQuery = useAiAgents();
    const { user } = useApp();

    if (agentsListQuery.isLoading) {
        return <PageSpinner />;
    }

    const userCanManageAiAgent = user.data?.ability.can(
        'manage',
        subject('AiAgent', {
            organizationUuid: user.data?.organizationUuid,
        }),
    );

    return (
        <Page
            withCenteredRoot
            withXLargePaddedContent
            withLargeContent
            backgroundColor="#FAFAFA"
        >
            <Stack gap="xxl" h="100%">
                <Group justify="space-between">
                    <Box>
                        <Group gap="xs">
                            <Title order={3}>AI Agents</Title>
                            <Tooltip
                                variant="xs"
                                label="This feature is in alpha. We're actively testing and improving it."
                                position="right"
                            >
                                <Badge
                                    variant="filled"
                                    color="pink.5"
                                    radius={6}
                                    size="md"
                                    py="xxs"
                                    px="xs"
                                >
                                    Alpha
                                </Badge>
                            </Tooltip>
                        </Group>
                        <Text c="dimmed" size="sm">
                            Ask questions in natural language and get insights
                            from your data.
                        </Text>
                    </Box>
                    <Group gap="xs">
                        {userCanManageAiAgent && (
                            <Button
                                size="xs"
                                variant="default"
                                radius="md"
                                component={Link}
                                to="/generalSettings/aiAgents/new"
                                leftSection={<MantineIcon icon={IconPlus} />}
                            >
                                New Agent
                            </Button>
                        )}
                        <Button
                            size="xs"
                            variant="default"
                            radius="md"
                            component="a"
                            href="https://docs.lightdash.com/guides/ai-analyst#ai-analyst"
                            target="_blank"
                            leftSection={<MantineIcon icon={IconBook} />}
                        >
                            Learn more
                        </Button>
                    </Group>
                </Group>
                {!agentsListQuery.data || agentsListQuery.data.length === 0 ? (
                    <Center
                        component={Paper}
                        h={100}
                        mah={600}
                        p="md"
                        bg="gray.0"
                        style={{ borderStyle: 'dashed', flex: 1 }}
                    >
                        <Stack gap="xs" align="center">
                            <Paper withBorder p="xs" radius="md">
                                <MantineIcon icon={IconHelp} color="gray" />
                            </Paper>
                            <Text size="sm" c="dimmed" ta="center">
                                No agents found. Get started by adding an agent.
                            </Text>
                        </Stack>
                    </Center>
                ) : (
                    <Grid>
                        {agentsListQuery.data.map((agent) => (
                            <Grid.Col span={4} key={agent.uuid}>
                                <AgentCard agent={agent} />
                            </Grid.Col>
                        ))}
                    </Grid>
                )}
            </Stack>
        </Page>
    );
};

export default AgentsListPage;
