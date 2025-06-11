import {
    Button,
    Group,
    Loader,
    Paper,
    Stack,
    Table,
    Text,
} from '@mantine-8/core';
import { IconHelpHexagon, IconPlus } from '@tabler/icons-react';
import { useCallback, useMemo, type FC } from 'react';
import { useNavigate } from 'react-router';
import { LightdashUserAvatar } from '../../../../components/Avatar';
import MantineIcon from '../../../../components/common/MantineIcon';
import {
    useGetSlack,
    useSlackChannels,
} from '../../../../hooks/slack/useSlack';
import { useProjects } from '../../../../hooks/useProjects';
import { useAiAgents } from '../hooks/useOrganizationAiAgents';

export const OrganizationAiAgents: FC = () => {
    const navigate = useNavigate();

    const { data: slackInstallation } = useGetSlack();
    const organizationHasSlack = !!slackInstallation?.organizationUuid;

    const agentsListQuery = useAiAgents();
    const projectsListQuery = useProjects();
    const slackChannelsQuery = useSlackChannels(
        '',
        {
            excludeArchived: true,
            excludeDms: true,
            excludeGroups: true,
        },
        { enabled: organizationHasSlack },
    );

    const isLoading = agentsListQuery.isLoading || projectsListQuery.isLoading;

    const isLoaded = agentsListQuery.isSuccess && projectsListQuery.isSuccess;

    const agentList = useMemo(() => {
        if (!isLoaded) return undefined;

        return agentsListQuery.data.map((agent) => {
            const project = projectsListQuery.data.find(
                (p) => p.projectUuid === agent.projectUuid,
            );

            if (!project) {
                throw new Error(`Project not found for agent`);
            }

            // TODO: handle multiple integrations
            const channel = slackChannelsQuery.data?.find(
                (c) =>
                    agent.integrations.length > 0 &&
                    c.id === agent.integrations[0].channelId,
            );

            return {
                uuid: agent.uuid,
                name: agent.name,
                projectName: project.name,
                channelName: channel?.name,
                updatedAt: agent.updatedAt,
                imageUrl: agent.imageUrl,
            };
        });
    }, [
        isLoaded,
        agentsListQuery.data,
        projectsListQuery.data,
        slackChannelsQuery.data,
    ]);

    const handleAgentClick = useCallback(
        (agentUuid: string) => {
            void navigate(`/generalSettings/aiAgents/${agentUuid}`);
        },
        [navigate],
    );

    const handleAddClick = useCallback(() => {
        void navigate('/generalSettings/aiAgents/new');
    }, [navigate]);

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

                            <Table.Th>Last modified</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {agentList.map((agent) => (
                            <Table.Tr
                                key={agent.uuid}
                                onClick={() => handleAgentClick(agent.uuid)}
                                style={{ cursor: 'pointer' }}
                            >
                                <Table.Td>
                                    <Group gap="sm">
                                        <LightdashUserAvatar
                                            size="sm"
                                            name={agent.name}
                                            variant="filled"
                                            src={agent.imageUrl}
                                        />

                                        <Text size="sm" fw={500}>
                                            {agent.name || 'AI Agent'}
                                        </Text>
                                    </Group>
                                </Table.Td>
                                <Table.Td>
                                    <Text size="sm" c="dimmed">
                                        {new Date(
                                            agent.updatedAt,
                                        ).toLocaleString()}
                                    </Text>
                                </Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            ) : (
                // TODO: add a nicer error state
                <Text>Something went wrong</Text>
            )}
        </Stack>
    );
};
