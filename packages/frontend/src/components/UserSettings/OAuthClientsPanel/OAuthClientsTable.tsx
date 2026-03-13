import { type OAuthClientSummary } from '@lightdash/common';
import { ActionIcon, Group, Table, Text, Tooltip } from '@mantine-8/core';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useDeleteOAuthClient } from '../../../hooks/useOAuthClients';
import MantineIcon from '../../common/MantineIcon';
import MantineModal from '../../common/MantineModal';
import { EditOAuthClientModal } from './EditOAuthClientModal';

const OAuthClientRow: FC<{
    client: OAuthClientSummary;
}> = ({ client }) => {
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const { mutate: deleteClient, isLoading: isDeleting } =
        useDeleteOAuthClient();

    return (
        <>
            <Table.Tr>
                <Table.Td>
                    <Text fw={500} size="sm">
                        {client.clientName}
                    </Text>
                </Table.Td>
                <Table.Td>
                    <Text size="sm" c="dimmed" ff="monospace">
                        {client.clientId}
                    </Text>
                </Table.Td>
                <Table.Td>
                    <Text size="sm" c="dimmed">
                        {client.redirectUris.join(', ')}
                    </Text>
                </Table.Td>
                <Table.Td>
                    <Text size="sm" c="dimmed">
                        {new Date(client.createdAt).toLocaleDateString()}
                    </Text>
                </Table.Td>
                <Table.Td>
                    <Group justify="flex-end" gap="xs">
                        <Tooltip label="Edit" position="left">
                            <ActionIcon
                                variant="subtle"
                                onClick={() => setIsEditModalOpen(true)}
                            >
                                <MantineIcon icon={IconPencil} />
                            </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Delete" position="left">
                            <ActionIcon
                                variant="subtle"
                                color="red"
                                onClick={() => setIsDeleteModalOpen(true)}
                            >
                                <MantineIcon icon={IconTrash} />
                            </ActionIcon>
                        </Tooltip>
                    </Group>
                </Table.Td>
            </Table.Tr>

            {isEditModalOpen && (
                <EditOAuthClientModal
                    client={client}
                    onClose={() => setIsEditModalOpen(false)}
                />
            )}

            <MantineModal
                opened={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                title={`Delete ${client.clientName}`}
                variant="delete"
                resourceType="OAuth application"
                resourceLabel={client.clientName}
                actions={
                    <ActionIcon
                        component="button"
                        variant="filled"
                        color="red"
                        size="lg"
                        loading={isDeleting}
                        onClick={() => {
                            deleteClient(client.clientId);
                            setIsDeleteModalOpen(false);
                        }}
                    >
                        <MantineIcon icon={IconTrash} />
                    </ActionIcon>
                }
            />
        </>
    );
};

export const OAuthClientsTable: FC<{
    clients: OAuthClientSummary[];
}> = ({ clients }) => (
    <Table highlightOnHover>
        <Table.Thead>
            <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Client ID</Table.Th>
                <Table.Th>Redirect URIs</Table.Th>
                <Table.Th>Created</Table.Th>
                <Table.Th />
            </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
            {clients.map((client) => (
                <OAuthClientRow key={client.clientId} client={client} />
            ))}
        </Table.Tbody>
    </Table>
);
