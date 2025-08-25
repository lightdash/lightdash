import { Badge, Loader, Paper, Stack, Table, Text } from '@mantine-8/core';
import { type FC } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useAiAgentThreads } from '../hooks/useOrganizationAiAgents';

type ConversationsListProps = {
    agentUuid: string;
    allUsers?: boolean;
};

export const ConversationsList: FC<ConversationsListProps> = ({
    agentUuid,
    allUsers = false,
}) => {
    const navigate = useNavigate();
    const { projectUuid } = useParams();
    const { data: threads, isLoading } = useAiAgentThreads(
        projectUuid!,
        agentUuid,
        allUsers,
    );

    const handleRowClick = async (threadUuid: string) => {
        await navigate(
            `/projects/${projectUuid}/ai-agents/${agentUuid}/threads/${threadUuid}`,
        );
    };

    if (isLoading) {
        return (
            <Stack align="center" justify="center" h="100%">
                <Loader />
            </Stack>
        );
    }

    if (threads?.length === 0) {
        return (
            <Stack>
                <Text>No conversations found</Text>
            </Stack>
        );
    }

    return (
        <Paper shadow="subtle" radius="md" withBorder>
            <Table.ScrollContainer minWidth={500} maxHeight={400}>
                <Table highlightOnHover stickyHeader>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th
                                style={{
                                    borderTopLeftRadius: '0.5rem',
                                }}
                            >
                                Conversation
                            </Table.Th>
                            <Table.Th>User</Table.Th>
                            <Table.Th>Created</Table.Th>
                            <Table.Th>Source</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {threads?.map((thread) => (
                            <Table.Tr
                                key={thread.uuid}
                                onClick={() => handleRowClick(thread.uuid)}
                                style={{
                                    cursor: 'pointer',
                                    transition: 'background-color 0.2s ease',
                                }}
                            >
                                <Table.Td>
                                    {thread.title ??
                                        thread.firstMessage.message}
                                </Table.Td>
                                <Table.Td>{thread.user.name}</Table.Td>
                                <Table.Td>
                                    {new Date(
                                        thread.createdAt,
                                    ).toLocaleString()}
                                </Table.Td>
                                <Table.Td>
                                    <Badge
                                        color={
                                            thread.createdFrom === 'slack'
                                                ? 'indigo'
                                                : 'blue'
                                        }
                                        variant="light"
                                    >
                                        {thread.createdFrom === 'slack'
                                            ? 'Slack'
                                            : 'Web'}
                                    </Badge>
                                </Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            </Table.ScrollContainer>
        </Paper>
    );
};
