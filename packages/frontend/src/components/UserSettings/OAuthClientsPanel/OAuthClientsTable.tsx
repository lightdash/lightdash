import { type OAuthClientSummary } from '@lightdash/common';
import { ActionIcon, Group, Menu, Paper, Table, Text } from '@mantine/core';
import { IconDots, IconPencil, IconTrash } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import tableStyles from '../../../hooks/styles/tableStyles.module.css';
import { useDeleteOAuthClient } from '../../../hooks/useOAuthClients';
import { CopyActionIcon } from '../../common/CopyActionIcon';
import MantineIcon from '../../common/MantineIcon';
import MantineModal from '../../common/MantineModal';
import { EditOAuthClientModal } from './EditOAuthClientModal';
import classesModule from './OAuthClientsTable.module.css';

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
                    <Text fw={500} fz="sm">
                        {client.clientName}
                    </Text>
                </Table.Td>
                <Table.Td>
                    <Group gap="xs" wrap="nowrap">
                        <Text
                            fz="sm"
                            c="dimmed"
                            className={classesModule.clientId}
                        >
                            {client.clientId}
                        </Text>
                        <CopyActionIcon
                            value={client.clientId}
                            tooltipPosition="right"
                            size="xs"
                            variant="transparent"
                        />
                    </Group>
                </Table.Td>
                <Table.Td>
                    <Text fz="sm">{client.redirectUris.join(', ')}</Text>
                </Table.Td>
                <Table.Td>
                    <Text fz="sm">
                        {new Date(client.createdAt).toLocaleDateString()}
                    </Text>
                </Table.Td>
                <Table.Td w="1%">
                    <Menu position="bottom-end">
                        <Menu.Target>
                            <ActionIcon variant="transparent" size="sm">
                                <MantineIcon icon={IconDots} />
                            </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                            <Menu.Item
                                leftSection={<MantineIcon icon={IconPencil} />}
                                onClick={() => setIsEditModalOpen(true)}
                            >
                                Edit
                            </Menu.Item>
                            <Menu.Item
                                leftSection={<MantineIcon icon={IconTrash} />}
                                color="red"
                                onClick={() => setIsDeleteModalOpen(true)}
                            >
                                Delete
                            </Menu.Item>
                        </Menu.Dropdown>
                    </Menu>
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
}> = ({ clients }) => {
    return (
        <Paper className="ld-overflow-hidden">
            <Table
                className={`${tableStyles.root} ${tableStyles.alignLastTdRight}`}
            >
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th className={classesModule.nameColumn}>
                            Name
                        </Table.Th>
                        <Table.Th>Client ID</Table.Th>
                        <Table.Th className={classesModule.redirectColumn}>
                            Redirect URIs
                        </Table.Th>
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
        </Paper>
    );
};
