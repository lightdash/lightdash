import {
    Avatar,
    Box,
    Button,
    Group,
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

export const AiAgents: FC = () => {
    const navigate = useNavigate();
    const { data: slackInstallation } = useGetSlack();
    const organizationHasSlack = !!slackInstallation?.organizationUuid;

    const { data: slackChannels } = useSlackChannels('', true, {
        enabled: organizationHasSlack,
    });

    const { data: projects } = useProjects();

    const agentList = useMemo(() => {
        if (!slackInstallation?.slackChannelProjectMappings?.length) {
            return undefined;
        }

        // Map agents from project mappings
        // TODO: Use different hook for agents after API is done
        return slackInstallation.slackChannelProjectMappings.map((mapping) => {
            const project = projects?.find(
                (p) => p.projectUuid === mapping.projectUuid,
            );
            const channel = slackChannels?.find(
                (c) => c.id === mapping.slackChannelId,
            );

            return {
                name: `Agent`,
                projectName: project?.name,
                channelName: channel?.name,
            };
        });
    }, [
        slackInstallation?.slackChannelProjectMappings,
        projects,
        slackChannels,
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
            {!agentList ? (
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
            ) : (
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
            )}
        </Stack>
    );
};
