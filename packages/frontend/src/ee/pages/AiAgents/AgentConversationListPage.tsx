import { Badge, Stack, Table } from '@mantine-8/core';
import { useNavigate, useParams } from 'react-router';
import PageSpinner from '../../../components/PageSpinner';
import { useAiAgentThreads } from '../../features/aiCopilot/hooks/useAiAgents';

const AgentThreadsListPage = () => {
    const { agentUuid } = useParams();
    const { data: threads, isLoading: isLoadingThreads } = useAiAgentThreads(
        agentUuid ?? '',
    );
    const navigate = useNavigate();

    const handleRowClick = (threadUuid: string) => {
        void navigate(`/aiAgents/${agentUuid}/threads/${threadUuid}`);
    };

    if (isLoadingThreads) {
        return <PageSpinner />;
    }

    return (
        <Stack>
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
        </Stack>
    );
};

export default AgentThreadsListPage;
