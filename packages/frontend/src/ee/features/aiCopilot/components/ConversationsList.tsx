import { Badge, Loader, Paper, Stack, Table, Text, ActionIcon, Group, Tooltip } from '@mantine-8/core';
import { useDisclosure } from '@mantine/hooks';
import { IconTrash } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import MantineModal from '../../../../components/common/MantineModal';
import useApp from '../../../../providers/App/useApp';
import { useAiAgentThreads, useDeleteAgentThreadMutation } from '../hooks/useOrganizationAiAgents';
import { ThreadDetailsModal } from './ThreadDetailsModal';

type ConversationsListProps = {
    agentUuid: string;
    agentName: string;
    allUsers?: boolean;
};

export const ConversationsList: FC<ConversationsListProps> = ({
    agentUuid,
    agentName,
    allUsers = false,
}) => {
    const { user } = useApp();
    const { data: threads, isLoading } = useAiAgentThreads(agentUuid, allUsers);
    const deleteThreadMutation = useDeleteAgentThreadMutation(agentUuid);
    const [selectedThreadUuid, setSelectedThreadUuid] = useState<string | null>(
        null,
    );
    const [deleteModalOpened, { open: openDeleteModal, close: closeDeleteModal }] = useDisclosure(false);
    const [threadToDelete, setThreadToDelete] = useState<string | null>(null);

    const handleRowClick = (threadUuid: string, event: React.MouseEvent) => {
        // Don't open modal if clicking on delete button
        if ((event.target as HTMLElement).closest('[data-delete-button]')) {
            return;
        }
        setSelectedThreadUuid(threadUuid);
    };

    const handleModalClose = () => {
        setSelectedThreadUuid(null);
    };

    const handleDeleteClick = (threadUuid: string, event: React.MouseEvent) => {
        event.stopPropagation();
        setThreadToDelete(threadUuid);
        openDeleteModal();
    };

    const handleDeleteConfirm = async () => {
        if (!threadToDelete) return;
        
        try {
            await deleteThreadMutation.mutateAsync(threadToDelete);
            closeDeleteModal();
            setThreadToDelete(null);
        } catch (error) {
            // Error is handled by the mutation hook
            closeDeleteModal();
            setThreadToDelete(null);
        }
    };

    const canDeleteThread = (thread: any) => {
        const isOwner = thread.user.uuid === user?.data?.userUuid;
        const isAdmin = user?.data?.ability?.can('manage', 'AiAgentThread', { 
            organizationUuid: user?.data?.organizationUuid 
        });
        return isOwner || isAdmin;
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
        <>
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
                                <Table.Th style={{ width: '60px' }}>Actions</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {threads?.map((thread) => (
                                <Table.Tr
                                    key={thread.uuid}
                                    onClick={(event) => handleRowClick(thread.uuid, event)}
                                    style={{
                                        cursor: 'pointer',
                                        transition:
                                            'background-color 0.2s ease',
                                    }}
                                >
                                    <Table.Td>{thread.firstMessage}</Table.Td>
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
                                    <Table.Td>
                                        {canDeleteThread(thread) && (
                                            <Tooltip label="Delete thread">
                                                <ActionIcon
                                                    data-delete-button
                                                    variant="subtle"
                                                    color="red"
                                                    size="sm"
                                                    onClick={(event) => handleDeleteClick(thread.uuid, event)}
                                                    loading={deleteThreadMutation.isPending && threadToDelete === thread.uuid}
                                                >
                                                    <MantineIcon icon={IconTrash} size={14} />
                                                </ActionIcon>
                                            </Tooltip>
                                        )}
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                </Table.ScrollContainer>
            </Paper>

            <ThreadDetailsModal
                agentName={agentName}
                agentUuid={agentUuid}
                threadUuid={selectedThreadUuid}
                onClose={handleModalClose}
            />

            <MantineModal
                opened={deleteModalOpened}
                onClose={closeDeleteModal}
                title="Delete Thread"
                icon={IconTrash}
                actions={
                    <Group>
                        <Button
                            variant="subtle"
                            onClick={closeDeleteModal}
                        >
                            Cancel
                        </Button>
                        <Button 
                            color="red" 
                            onClick={handleDeleteConfirm}
                            loading={deleteThreadMutation.isPending}
                        >
                            Delete
                        </Button>
                    </Group>
                }
            >
                <Stack gap="md">
                    <Text>
                        Are you sure you want to delete this conversation thread? This action cannot be undone.
                    </Text>
                </Stack>
            </MantineModal>
        </>
    );
};
