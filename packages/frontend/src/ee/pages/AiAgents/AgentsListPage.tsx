import { subject } from '@casl/ability';
import {
    Box,
    Button,
    Card,
    Grid,
    Group,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import { IconPlus } from '@tabler/icons-react';
import { Link } from 'react-router';
import Page from '../../../components/common/Page/Page';
import PageSpinner from '../../../components/PageSpinner';
import useApp from '../../../providers/App/useApp';
import { useAiAgents } from '../../features/aiCopilot/hooks/useAiAgents';

type AgentCardProps = {
    name: string;
    description: string;
    uuid: string;
};

const AgentCard = ({ name, description, uuid }: AgentCardProps) => {
    return (
        <Card
            withBorder
            p="lg"
            radius="md"
            styles={{
                root: { height: '100%' },
            }}
            component={Link}
            to={`/aiAgents/${uuid}/threads`}
        >
            <Stack gap="sm">
                <Group>
                    <Box
                        w={40}
                        h={40}
                        bg="gray.1"
                        style={{
                            borderRadius: '50%',
                            overflow: 'hidden',
                        }}
                    ></Box>
                    <Title order={4}>{name}</Title>
                </Group>

                <Text size="sm" c="dimmed">
                    {description}
                </Text>
            </Stack>
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
                        <AgentCard
                            name={agent.name}
                            description="Labore elit in dolor duis anim aute quis sit."
                            uuid={agent.uuid}
                        />
                    </Grid.Col>
                ))}
            </Grid>
        </Page>
    );
};

export default AgentsListPage;
