import { subject } from '@casl/ability';
import { type AiAgent } from '@lightdash/common';
import {
    Button,
    Card,
    Divider,
    Grid,
    Group,
    Pill,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import { IconPlus } from '@tabler/icons-react';
import { Link } from 'react-router';
import Page from '../../../components/common/Page/Page';
import PageSpinner from '../../../components/PageSpinner';
import useApp from '../../../providers/App/useApp';
import { AgentAvatar } from '../../features/aiCopilot/components/AgentAvatar';
import { useAiAgents } from '../../features/aiCopilot/hooks/useAiAgents';

type AgentCardProps = {
    agent: AiAgent;
};

const AgentCard = ({ agent }: AgentCardProps) => {
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
            <Stack gap="sm" p="lg">
                <Group>
                    <AgentAvatar name={agent.name} size={54} />
                    <Stack gap="xs">
                        <Title order={4}>{agent.name}</Title>
                        <Group gap={4}>
                            {agent.tags && agent.tags.length > 0 ? (
                                agent.tags.map((tag) => (
                                    <Pill key={tag}>{tag}</Pill>
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
            <Group justify="space-between" p="lg">
                <Button
                    variant="default"
                    c="dimmed"
                    bd="none"
                    component={Link}
                    to={`/generalSettings/aiAgents/${agent.uuid}`}
                >
                    Settings
                </Button>
                <Button variant="default">Start a chat</Button>
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

    const userCanManageOrganization = user.data?.ability.can(
        'manage',
        subject('Organization', {
            organizationUuid: user.data?.organizationUuid,
        }),
    );

    return (
        <Page
            withFullHeight
            withPaddedContent
            title="Lightdash Agents"
            header={
                <Group justify="space-between" mb="lg" p="md">
                    <Title>Lightdash Agents</Title>
                    {userCanManageOrganization && (
                        <Button
                            component={Link}
                            to="/generalSettings/aiAgents/new"
                            leftSection={<IconPlus />}
                        >
                            New
                        </Button>
                    )}
                </Group>
            }
        >
            <Grid>
                {agentsListQuery.data?.map((agent) => (
                    <Grid.Col span={4} key={agent.uuid}>
                        <AgentCard agent={agent} />
                    </Grid.Col>
                ))}
            </Grid>
        </Page>
    );
};

export default AgentsListPage;
