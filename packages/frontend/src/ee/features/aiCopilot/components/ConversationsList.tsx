import { Badge, Loader, Stack, Table, Text, Title } from '@mantine-8/core';
import { useState, type FC } from 'react';
import { useAiAgentThreads } from '../hooks/useAiAgents';
import { ThreadDetailsModal } from './ThreadDetailsModal';

type ConversationsListProps = {
    agentUuid: string;
    agentName: string;
};

export const ConversationsList: FC<ConversationsListProps> = ({
    agentUuid,
    agentName,
}) => {
    const { data: threads, isLoading } = useAiAgentThreads(agentUuid);
    const [selectedThreadUuid, setSelectedThreadUuid] = useState<string | null>(
        null,
    );

    const handleRowClick = (threadUuid: string) => {
        setSelectedThreadUuid(threadUuid);
    };

    const handleModalClose = () => {
        setSelectedThreadUuid(null);
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
        <Stack>
            <Title order={5}>Conversations</Title>

            <Table highlightOnHover withTableBorder>
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>Conversation</Table.Th>
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
                            <Table.Td>{thread.firstMessage}</Table.Td>
                            <Table.Td>{thread.user.name}</Table.Td>
                            <Table.Td>
                                {new Date(thread.createdAt).toLocaleString()}
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

            <ThreadDetailsModal
                agentName={agentName}
                agentUuid={agentUuid}
                threadUuid={selectedThreadUuid}
                onClose={handleModalClose}
            />
        </Stack>
    );
};
