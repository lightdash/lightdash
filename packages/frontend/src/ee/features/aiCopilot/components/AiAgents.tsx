import {
    Avatar,
    Box,
    Button,
    Group,
    Loader,
    Paper,
    Stack,
    Table,
    Text,
    Title,
} from '@mantine-8/core';
import { IconHelpHexagon, IconPlus } from '@tabler/icons-react';
import { useCallback, useMemo, type FC } from 'react';
import { useNavigate } from 'react-router';
import MantineIcon from '../../../../components/common/MantineIcon';
import {
    useGetSlack,
    useSlackChannels,
} from '../../../../hooks/slack/useSlack';
import { useProjects } from '../../../../hooks/useProjects';
import { useAiAgents } from '../hooks/useAiAgents';

export const AiAgents: FC = () => {
    const navigate = useNavigate();

    const { data: slackInstallation } = useGetSlack();
    const organizationHasSlack = !!slackInstallation?.organizationUuid;

    const agentsListQuery = useAiAgents();
    const projectsListQuery = useProjects();
    const slackChannelsQuery = useSlackChannels('', true, {
        enabled: organizationHasSlack,
    });

    const isLoading =
        agentsListQuery.isLoading ||
        projectsListQuery.isLoading ||
        slackChannelsQuery.isLoading;

    const isLoaded =
        agentsListQuery.isSuccess &&
        projectsListQuery.isSuccess &&
        slackChannelsQuery.isSuccess;

    const agentList = useMemo(() => {
        if (!isLoaded) return undefined;

        console.log(agentsListQuery.data);

        return agentsListQuery.data.map((agent) => {
            const project = projectsListQuery.data.find(
                (p) => p.projectUuid === agent.projectUuid,
            );

            if (!project) {
                throw new Error(`Project not found for agent`);
            }

            // TODO: handle multiple integrations
            const channel = slackChannelsQuery.data?.find(
                (c) => c.id === agent.integrations[0].channelId,
            );

            return {
                name: agent.name,
                projectName: project.name,
                channelName: channel?.name,
            };
        });
    }, [
        isLoaded,
        agentsListQuery.data,
        projectsListQuery.data,
        slackChannelsQuery.data,
    ]);

    const handleAgentClick = useCallback(
        (index: number) => {
            void navigate(`/generalSettings/aiAgents/${index + 1}`);
        },
        [navigate],
    );

    const handleAddClick = useCallback(() => {
        void navigate('/generalSettings/aiAgents/new');
    }, [navigate]);

    if (!organizationHasSlack) {
        return (
            <Stack gap="md">
                <Box>
                    <Title order={5}>AI Agent Configuration</Title>
                    <Text size="sm" c="dimmed">
                        You need to connect Slack first in the Integrations
                        settings before you can configure AI agents.
                    </Text>
                </Box>
            </Stack>
        );
    }

    return (
        <Stack gap="sm">
            <Group justify="flex-end">
                <Button
                    variant="default"
                    leftSection={<MantineIcon icon={IconPlus} />}
                    size="xs"
                    onClick={handleAddClick}
                >
                    Add
                </Button>
            </Group>

            {isLoading ? (
                // TODO: add a nicer loading state
                <Paper withBorder p="md" radius="md" bg="gray.0">
                    <Stack gap="xs" align="center">
                        <Loader />
                    </Stack>
                </Paper>
            ) : agentList && agentList.length === 0 ? (
                <Paper withBorder p="md" radius="md" bg="gray.0">
                    <Stack gap="xs" align="center">
                        <Paper withBorder p="xs" radius="md">
                            <MantineIcon icon={IconHelpHexagon} />
                        </Paper>
                        <Text size="sm" c="dimmed" ta="center">
                            No agents found. Get started by adding an agent.
                        </Text>
                    </Stack>
                </Paper>
            ) : agentList && agentList.length > 0 ? (
                <Table highlightOnHover withTableBorder>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Name</Table.Th>
                            <Table.Th>Description</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {agentList.map((agent, index) => (
                            <Table.Tr
                                key={index}
                                onClick={() => handleAgentClick(index)}
                                style={{ cursor: 'pointer' }}
                            >
                                <Table.Td>
                                    <Group gap="sm">
                                        <Avatar
                                            size={30}
                                            radius="sm"
                                            color="blue.6"
                                        >
                                            {index + 1}
                                        </Avatar>
                                        <Text fw={500}>{agent.name}</Text>
                                    </Group>
                                </Table.Td>
                                <Table.Td>
                                    {agent.projectName && agent.channelName && (
                                        <Text size="xs" c="dimmed">
                                            Answers questions about{' '}
                                            <b>{agent.projectName}</b> data in{' '}
                                            <b>{agent.channelName}</b>
                                        </Text>
                                    )}
                                </Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            ) : (
                // TODO: add a nicer error state
                <>error state...</>
            )}
        </Stack>
    );
};
